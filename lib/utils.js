'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.matchesSpecialFilters = matchesSpecialFilters;
exports.filterSpecials = filterSpecials;
exports.stripSpecialFilters = stripSpecialFilters;
exports.sorter = sorter;
var _ = {
  some: require('lodash/some'),
  isMatch: require('lodash/isMatch'),
  isEmpty: require('lodash/isEmpty'),
  each: require('lodash/each'),
  isObject: require('lodash/isObject'),
  cloneDeep: require('lodash/cloneDeep')
};

var specialFilters = exports.specialFilters = {
  $in: function $in(key, ins) {
    return function (current) {
      return ins.indexOf(current[key]) !== -1;
    };
  },
  $nin: function $nin(key, nins) {
    return function (current) {
      return nins.indexOf(current[key]) === -1;
    };
  },
  $lt: function $lt(key, value) {
    return function (current) {
      return current[key] < value;
    };
  },
  $lte: function $lte(key, value) {
    return function (current) {
      return current[key] <= value;
    };
  },
  $gt: function $gt(key, value) {
    return function (current) {
      return current[key] > value;
    };
  },
  $gte: function $gte(key, value) {
    return function (current) {
      return current[key] >= value;
    };
  },
  $ne: function $ne(key, value) {
    return function (current) {
      return current[key] !== value;
    };
  },
  $like: function $like(key, value) {
    return function (current) {
      return (current.hasOwnProperty(key) && current[key].toString().toLowerCase().includes(value.toString().toLowerCase()));
    }
  }
};

function matchesSpecialFilters(current, query) {
  var matches = true;

  if (query.$or) {
    if (!_.some(query.$or, function (or) {
      return _.isMatch(current, or);
    })) {
      matches = false;
    }
  }

  if (query.$search) {
    matches = _.some(query.$search, function (search) {
      return _.some(search, function (value, key) {
        if (_.isObject(value)) {
          return _.some(value, function (target, prop) {
            if (specialFilters[prop]) {
              return specialFilters[prop](key, target)(current)
            }
          });
        }
      });
    });
  }
  else {
    _.each(query, function (value, key) {
      if (_.isObject(value)) {
        _.each(value, function (target, prop) {
          if (specialFilters[prop]) {
            if (!specialFilters[prop](key, target)(current)) {
              matches = false;
            }
          }
        });
      }
    });
  }

  return matches;
}

function filterSpecials(values, query) {
  return values.filter(function (obj) {
    return matchesSpecialFilters(obj, query);
  });
}

function stripSpecialFilters(query) {
  var newQuery = _.cloneDeep(query);

  delete newQuery.$or;
  delete newQuery.$search;

  _.each(newQuery, function (value, key) {
    if (_.isObject(value)) {
      _.each(value, function (target, prop) {
        if (specialFilters[prop]) {
          delete value[prop];
        }
      });
      if (_.isEmpty(value)) {
        delete newQuery[key];
      }
    }
  });

  return newQuery;
}

function sorter($sort) {
  return function (first, second) {
    var comparator = 0;
    _.each($sort, function (modifier, key) {
      modifier = parseInt(modifier, 10);

      if (first[key] < second[key]) {
        comparator -= 1 * modifier;
      }

      if (first[key] > second[key]) {
        comparator += 1 * modifier;
      }
    });
    return comparator;
  };
}