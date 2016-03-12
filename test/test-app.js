import service from '../src';
import levelup from 'levelup';
import memdown from 'memdown';
import feathers from 'feathers';
import rest from 'feathers-rest';
import bodyParser from 'body-parser';
import socketio from 'feathers-socketio';

const db = levelup('/test-app', { db: memdown, valueEncoding: 'json' });

const app = feathers()
  .configure(rest())
  .configure(socketio())
  .use(bodyParser.json())
  .use(bodyParser.urlencoded({ extended: true }));

app.use('/todos', service({
  paginate: {
    default: 2,
    max: 4
  },
  db: db
}));

module.exports = app.listen(3030);

console.log('Feathers Todo levelup service running on 127.0.0.1:3030');
