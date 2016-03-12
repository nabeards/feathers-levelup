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

function clean() {
  memdown.clearGlobalStore();
}

describe('Feathers LevelUP', () => {
  describe('service example app', () => {
    after(done => server.close(() => done()));

    example();
  });

  describe('service tests', () => {
    beforeEach(clean);
    after(clean);

    beforeEach(done => {
      people.create({
        name: 'Doug',
        age: 32
      }).then(data => {
        _ids.Doug = data.id;
        done();
      }, done);
    });

    afterEach(done => {
      const doneNow = () => done();
      people.remove(_ids.Doug).then(doneNow, doneNow);
    });

    it('is CommonJS compatible', () => {
      assert.equal(typeof require('../lib'), 'function');
    });

    base(people, _ids, errors);
  });
});
