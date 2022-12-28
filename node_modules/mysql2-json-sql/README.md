## mysql2-json-sql

> MySQL2 wrapper for Node.js with json interface. Supports prepared transactional

## Installing with [npm](http://npmjs.org/)

```
npm install mysql2-json-sql
```

## Usage
###
```js
// Include mysql2-json
// for example: schema test_db contains table test
const mysql = require('mysql2-json-sql');

const db = mysql({
        host: 'localhost',
        user: 'test',
        password: '',
        database: 'test_db',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });

// use table manually
const test = db.test_db.table('test');

// or load all tables automatically
const tables = await db.test_db.tables();

// after loading table we can use 3 type of code
// #1 get data from table directly
test.find({_id:12},(err,result)=>{
     console.log(result);
 })

// #2 get data from tables 
tables.test.find({_id:12},(err,result)=>{
     console.log(result);
 })

// #3 get data from db 
db.test_db.test.find({_id:12},(err,result)=>{
     console.log(result);
 })


 ```
>response
```json
[{
"_id":12, "name": "test"
}]
```

## Inserting documents

```js
var data = { _id:13, name: 'world'};

db.test_db.test.insert(data, function (err, newDoc) {   // Callback is optional
  // newDoc is the newly inserted document, including its _id
  // newDoc has no key called notToBeSaved since its value was undefined
});
```
> we can do bulk-insert data also
```js
db.test_db.test.insert([{ _id: 14, name: 'hello' }, { _id: 15, name:'word' }], function (err, newDocs) {
  // Two documents were inserted in the database
  // newDocs is an array with these documents, augmented with their _id
});
```
## Finding data

```js
// Finding all planets in the solar system
db.test_db.test.find({ name: 'world' }, function (err, docs) {
  // docs is an array containing documents Mars, Earth, Jupiter
  // If no document is found, docs is equal to []
});
```
