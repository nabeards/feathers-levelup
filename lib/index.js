'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = init;

var _uuid = require('uuid');

var _uuid2 = _interopRequireDefault(_uuid);

var _uberproto = require('uberproto');

var _uberproto2 = _interopRequireDefault(_uberproto);

var _feathersErrors = require('feathers-errors');

var _feathersErrors2 = _interopRequireDefault(_feathersErrors);

var _feathersQueryFilters = require('feathers-query-filters');

var _feathersQueryFilters2 = _interopRequireDefault(_feathersQueryFilters);

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

if (!global._babelPolyfill) {
  require('babel-polyfill');
}

var _ = {
  values: require('lodash/values'),
  isEmpty: require('lodash/isEmpty'),
  where: require('lodash/filter'),
  extend: require('lodash/extend'),
  omit: require('lodash/omit'),
  pick: require('lodash/pick'),
  clone: require('lodash/clone')
};

var counter = -1;

var Service = function () {
  function Service() {
    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Service);

    if (!options.db) {
      throw new Error('You must provide a LevelUP database instance');
    }

    if (options.db.options.valueEncoding !== 'json') {
      throw new Error('LevelUP valueEncoding option must be set to "json"');
    }

    this.db = options.db;
    this.paginate = options.paginate || {};
    this._id = options.idField || 'id';
    this.sortField = options.sortField || '_createdAt';
  }

  _createClass(Service, [{
    key: 'createKey',
    value: function createKey(obj) {
      counter += 1;
      var uid = _uuid2.default.v4();
      var prefix = this.sortField && obj[this.sortField] ? obj[this.sortField].toString() : '';

      return prefix + ':' + counter + ':' + uid;
    }
  }, {
    key: 'extend',
    value: function extend(obj) {
      return _uberproto2.default.extend(obj, this);
    }

    // loads entire data set and performs an in-memory
    // filter, sort, skip, limit and select

  }, {
    key: '_findInMemory',
    value: function _findInMemory(query, filters) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var values = [];

        _this.db.createReadStream().on('data', function (obj) {
          values.push(obj.value);
        }).on('end', function () {
          values = (0, _utils.filterSpecials)(values, query);

          var plainQuery = (0, _utils.stripSpecialFilters)(query);

          if (!_.isEmpty(plainQuery)) {
            values = _.where(values, plainQuery);
          }

          var total = values.length;

          if (filters.$sort) {
            values.sort((0, _utils.sorter)(filters.$sort));
          }

          if (filters.$skip) {
            values = values.slice(filters.$skip);
          }

          if (filters.$limit) {
            values = values.slice(0, filters.$limit);
          }

          if (filters.$select) {
            values = values.map(function (value) {
              return _.pick(value, filters.$select);
            });
          }

          resolve({
            total: total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: values
          });
        }).on('error', function (err) {
          reject(new _feathersErrors2.default.GeneralError('Internal error reading database: ' + err));
        });
      });
    }

    // performs an efficient range query over a sorted set,
    // collecting matching results until we satisfy our pagination limit

  }, {
    key: '_findOptimized',
    value: function _findOptimized(query, filters) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {

        var total = 0;
        var values = [];
        var options = {};
        var skipped = 0;

        if (filters.$sort) {
          if (filters.$sort[_this2.sortField] < 0) {
            options.reverse = true;
          }
        }

        if (query && query[_this2.sortField]) {
          ['gt', 'lt', 'gte', 'lte'].forEach(function (op) {
            if (query[_this2.sortField].hasOwnProperty('$' + op)) {
              options[op] = query[_this2.sortField]['$' + op];
            }
          });
        }

        _this2.db.createReadStream(options).on('data', function (obj) {
          if (!(0, _utils.matchesSpecialFilters)(obj.value, query)) {
            return;
          }

          var plainQuery = (0, _utils.stripSpecialFilters)(query);

          if (!_.isEmpty(plainQuery)) {
            if (!plainQuery.$search && _.where([obj.value], plainQuery).length === 0) {
              return;
            }
          }

          total += 1;

          if (filters.$skip && skipped < filters.$skip) {
            skipped += 1;
            return;
          }

          if (filters.$limit && values.length >= filters.$limit) {
            return;
          }

          values.push(obj.value);
        }).on('end', function () {
          if (filters.$select) {
            values = values.map(function (value) {
              return _.pick(value, filters.$select);
            });
          }

          resolve({
            total: total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: values
          });
        }).on('error', function (err) {
          reject(new _feathersErrors2.default.GeneralError('Internal error reading database: ' + err));
        });
      });
    }
  }, {
    key: '_canPerformOptimized',
    value: function _canPerformOptimized(query, filters) {
      if (!filters.$sort) {
        return true;
      }

      if (Object.keys(filters.$sort).length === 1) {
        if (filters.$sort.hasOwnProperty(this.sortField)) {
          return true;
        }
      }

      return false;
    }

    // Find without hooks and mixins that can be used internally and always returns
    // a pagination object

  }, {
    key: '_find',
    value: function _find(params) {
      var getFilter = arguments.length <= 1 || arguments[1] === undefined ? _feathersQueryFilters2.default : arguments[1];

      var _getFilter = getFilter(params.query || {});

      var filters = _getFilter.filters;
      var query = _getFilter.query;


      return this._canPerformOptimized(query, filters) ? this._findOptimized(query, filters) : this._findInMemory(query, filters);
    }
  }, {
    key: 'find',
    value: function find(params) {
      var paginate = typeof params.paginate !== 'undefined' ? params.paginate : this.paginate;
      // Call the internal find with query parameter that include pagination
      var result = this._find(params, function (query) {
        return (0, _feathersQueryFilters2.default)(query, paginate);
      });

      if (!paginate.default) {
        return result.then(function (page) {
          return page.data;
        });
      }

      return result;
    }
  }, {
    key: 'get',
    value: function get() {
      return this._get.apply(this, arguments);
    }
  }, {
    key: '_get',
    value: function _get(id) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        _this3.db.get(id, function (err, data) {
          if (err) {
            if (err.notFound) {
              return reject(new _feathersErrors2.default.NotFound('No record found for id \'' + id + '\''));
            }
            return reject(new _feathersErrors2.default.GeneralError('Internal error fetching id \'' + id + '\' (' + err + ')'));
          }

          resolve(data);
        });
      });
    }

    // Create without hooks and mixins that can be used internally

  }, {
    key: '_create',
    value: function _create(data) {
      var _this4 = this;

      var current = _.extend({}, data, {
        _createdAt: data._createdAt || new Date().getTime()
      });

      var id = current[this._id] = this.createKey(current);

      return new Promise(function (resolve, reject) {
        _this4.db.put(id, current, function (err) {
          if (err) {
            return reject(new _feathersErrors2.default.GeneralError('Internal error creating id \'' + id + '\' (' + err + ')'));
          }
          resolve(current);
        });
      });
    }
  }, {
    key: 'create',
    value: function create(data) {
      var _this5 = this;

      if (Array.isArray(data)) {
        return Promise.all(data.map(function (current) {
          return _this5._create(current);
        }));
      }

      return this._create(data);
    }
  }, {
    key: 'update',
    value: function update(id, data) {
      var _this6 = this;

      if (id === null || Array.isArray(data)) {
        return Promise.reject(new _feathersErrors2.default.BadRequest('You can not replace multiple instances. Did you mean \'patch\'?'));
      }

      return this._get(id).then(function () {
        return new Promise(function (resolve, reject) {
          var current = _.extend({}, data, _defineProperty({}, _this6._id, id));

          _this6.db.put(id, current, function (err) {
            if (err) {
              return reject(new _feathersErrors2.default.GeneralError('Internal error updating id \'' + id + '\' (' + err + ')'));
            }
            resolve(current);
          });
        });
      });
    }

    // Patch without hooks and mixins that can be used internally

  }, {
    key: '_patch',
    value: function _patch(id, updateData) {
      var _this7 = this;

      return this._get(id).then(function (old) {
        return new Promise(function (resolve, reject) {
          var current = _.extend(old, updateData);
          _this7.db.put(id, current, function (err) {
            if (err) {
              return reject(new _feathersErrors2.default.GeneralError('Internal error updating id \'' + id + '\' (' + err + ')'));
            }
            resolve(current);
          });
        });
      });
    }
  }, {
    key: 'patch',
    value: function patch(id, data, params) {
      var _this8 = this;

      if (id === null) {
        return this._find(params).then(function (page) {
          return Promise.all(page.data.map(function (current) {
            return _this8._patch(current[_this8._id], data, params);
          }));
        });
      }

      return this._patch(id, data, params);
    }

    // Remove without hooks and mixins that can be used internally

  }, {
    key: '_remove',
    value: function _remove(id) {
      var _this9 = this;

      return this._get(id).then(function (data) {
        return new Promise(function (resolve, reject) {
          _this9.db.del(id, function (err) {
            if (err) {
              return reject(new _feathersErrors2.default.GeneralError('Internal error removing id \'' + id + '\' (' + err + ')'));
            }
            resolve(data);
          });
        });
      });
    }
  }, {
    key: 'remove',
    value: function remove(id, params) {
      var _this10 = this;

      if (id === null) {
        return this._find(params).then(function (page) {
          return Promise.all(page.data.map(function (current) {
            return _this10._remove(current[_this10._id]);
          }));
        });
      }

      return this._remove(id);
    }
  }]);

  return Service;
}();

function init(options) {
  return new Service(options);
}

init.Service = Service;
module.exports = exports['default'];