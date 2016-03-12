if(!global._babelPolyfill) { require('babel-polyfill'); }

import uuid from 'uuid';
import Proto from 'uberproto';
import errors from 'feathers-errors';
import filter from 'feathers-query-filters';
import { sorter, filterSpecials } from './utils';

const _ = {
  values: require('lodash/values'),
  isEmpty: require('lodash/isEmpty'),
  where: require('lodash/filter'),
  extend: require('lodash/extend'),
  omit: require('lodash/omit'),
  pick: require('lodash/pick')
};

var counter = -1;

const createKey = () => {
  counter += 1;
  let uid = uuid.v4();
  let date = new Date().getTime();

  return `${date}-${counter}-${uid}`;
};

class Service {
  constructor(options = {}) {
    if (!options) {
      throw new Error('LevelUP options have to be provided');
    }

    if (!options.db) {
      throw new Error('You must provide a LevelUP database instance');
    }

    if (options.db.options.valueEncoding !== 'json') {
      throw new Error('LevelUP valueEncoding option must be set to "json"');
    }

    this.db = options.db;
    this.paginate = options.paginate || {};
    this._id = options.idField || 'id';
  }

  extend(obj) {
    return Proto.extend(obj, this);
  }

  // Find without hooks and mixins that can be used internally and always returns
  // a pagination object
  _find(params, getFilter = filter) {
    const query = params.query || {};
    const filters = getFilter(query);

    return new Promise((resolve, reject) => {
      var values = [];

      this.db.createReadStream()
        .on('data', obj => {
          values.push(obj.value);
        })
        .on('end', () => {
          values = filterSpecials(values, query);

          if(!_.isEmpty(query)) {
            values = _.where(values, query);
          }

          const total = values.length;

          if (filters.$sort) {
            values.sort(sorter(filters.$sort));
          }

          if (filters.$skip){
            values = values.slice(filters.$skip);
          }

          if (filters.$limit) {
            values = values.slice(0, filters.$limit);
          }

          if (filters.$select) {
            values = values.map(value => _.pick(value, filters.$select));
          }

          resolve({
            total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: values
          });
        })
        .on('error', err => {
          reject(new errors.GeneralError(`Internal error reading database: ${err}`));
        });
    });
  }

  find(params) {
    // Call the internal find with query parameter that include pagination
    const result = this._find(params, query => filter(query, this.paginate));

    if(!this.paginate.default) {
      return result.then(page => page.data);
    }

    return result;
  }

  get(id) {
    return new Promise((resolve, reject) => {
      this.db.get(id, function(err, data) {
        if (err) {
          if (err.notFound) {
            return reject(new errors.NotFound(`No record found for id '${id}'`));
          }
          return reject(new errors.GeneralError(`Internal error fetching id '${id}' (${err})`));
        }

        resolve(data);
      });
    });
  }

  // Create without hooks and mixins that can be used internally
  _create(data) {
    let id = data[this._id] || createKey();
    let current = _.extend({}, data, { [this._id]: id });

    return new Promise((resolve, reject) => {
      this.db.put(id, current, function(err) {
        if (err) {
          return reject(new errors.GeneralError(`Internal error creating id '${id}' (${err})`));
        }
        resolve(current);
      });
    });
  }

  create(data) {
    if(Array.isArray(data)) {
      return Promise.all(data.map(current => this._create(current)));
    }

    return this._create(data);
  }

  update(id, data) {
    if(id === null || Array.isArray(data)) {
      return Promise.reject(new errors.BadRequest(
        `You can not replace multiple instances. Did you mean 'patch'?`
      ));
    }

    return this
      .get(id)
      .then(() => {
        return new Promise((resolve, reject) => {
          let current = _.extend({}, data, { [this._id]: id });

          this.db.put(id, current, function(err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error updating id '${id}' (${err})`));
            }
            resolve(current);
          });
        });
      });
  }

  // Patch without hooks and mixins that can be used internally
  _patch(id, updateData) {
    return this
      .get(id)
      .then((old) => {
        return new Promise((resolve, reject) => {
          var current = _.extend(old, updateData);
          this.db.put(id, current, function(err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error updating id '${id}' (${err})`));
            }
            resolve(current);
          });
        });
      });
  }

  patch(id, data, params) {
    if(id === null) {
      return this._find(params).then(page => {
        return Promise.all(page.data.map(
          current => this._patch(current[this._id], data, params))
        );
      });
    }

    return this._patch(id, data, params);
  }

  // Remove without hooks and mixins that can be used internally
  _remove(id) {
    return this
      .get(id)
      .then((data) => {
        return new Promise((resolve, reject) => {
          this.db.del(id, function(err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error removing id '${id}' (${err})`));
            }
            resolve(data);
          });
        });
      });
  }

  remove(id, params) {
    if(id === null) {
      return this._find(params).then(page =>
        Promise.all(page.data.map(current => this._remove(current[this._id])
      )));
    }

    return this._remove(id);
  }
}

export default function init(options) {
  return new Service(options);
}

init.Service = Service;
