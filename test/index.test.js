/*jshint expr: true*/

import assert from 'assert';
import service from '../src';
import levelup from 'levelup';
import memdown from 'memdown';
import feathers from 'feathers';
import server from './test-app';
import errors from 'feathers-errors';
import { base, example } from 'feathers-service-tests';

const _ids = {};
const db = levelup('/test', { db: memdown, valueEncoding: 'json' });
const app = feathers().use('/people', service({ db: db }));
const people = app.service('people');

describe('Feathers LevelUP', () => {
  describe('base tests', () => {
    beforeEach(() => {
      return people.create({
        name: 'Doug',
        age: 32
      }).then(data => {
        _ids.Doug = data.id;
      });
    });

    afterEach(done => {
      var doneNow = () => done();
      return people.remove(_ids.Doug).then(doneNow, doneNow);
    });

    it('is CommonJS compatible', () => {
      assert.equal(typeof require('../lib'), 'function');
    });

    base(people, _ids, errors);
  });

  describe('example tests', () => {
    after(done => server.close(() => done()));

    example();
  });

  describe('options', () => {
    it('requires an instance of leveldb passed as a "db" property', () => {
      assert.throws(() => {
        service({});
      }, /database instance/);
    });

    it('requires the db instance to have valueEncoding set to "json"', () => {
      assert.throws(() => {
        service({
          db: levelup('/test', { db: memdown })
        });
      }, /valueEncoding/);
    });
  });

  describe('_createdAt', () => {
    it('is automatically added to newly created objects', () => {
      let createTime = new Date().getTime();
      return people.create({
        name: 'Doug',
        age: 32
      }).then(data => {
        let tolerance = 100; // ms
        assert(createTime - data._createdAt < tolerance);
        return people.remove(data.id);
      });
    });

    it('can be used as a keyPrefixField', () => {
      assert.equal(people.keyPrefixField, '_createdAt');

      return people.create({
        name: 'Doug',
        age: 32
      }).then(data => {
        assert.equal(data._createdAt, data.id.split(':')[0]);
        return people.remove(data.id);
      });
    });
  });

  describe('keyPrefixField', () => {
    it('automatically prepends the prop value to the object id', () => {
      people.keyPrefixField = 'name';

      return people.create({
        name: 'Jane',
        age: 29
      }).then(data => {
        assert.equal('Jane', data.id.split(':')[0]);
        return people.remove(data.id);
      });
    });

    it('can be configured to be any stringable property', () => {
      people.keyPrefixField = 'age';

      return people.create({
        name: 'Jane',
        age: 29
      }).then(data => {
        assert.equal('29', data.id.split(':')[0]);
        return people.remove(data.id);
      });
    });
  });
});
