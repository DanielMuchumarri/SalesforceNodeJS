
//Salesforce Libraries
//import fetch from 'node-fetch';
import express from 'express';
import jsforce from 'jsforce';
import dotenv from 'dotenv';
//import { CLIENT_MULTI_RESULTS } from 'node_modules\\mysql\\lib\\protocol\\constants\\client.js';
dotenv.config()

const app = express()
const PORT = 3001

//Salesforc connection
const {SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_TOKEN}=process.env
const conn = new jsforce.Connection({
    loginUrl:SF_LOGIN_URL
})

conn.login(SF_USERNAME,SF_PASSWORD+SF_TOKEN,(err,userInfo)=>{
    if(err){
        console.log(err)
    }else{
        console.log('User Id:' + userInfo.id)
        console.log('Org Id:' + userInfo.organizationId)
        //processFetchMetadataData();
        createSnapShotDB('LTIMindtree');
    }
})

//const fetch = require('node-fetch');
import fetch from 'node-fetch';

//MySQL Libraries
import mysql from 'mysql2';
//import mysql from 'mysql2-json-sql';
//MySQL connection
var mySQLCon = mysql.createConnection({
    host:"localhost",
    user:"root",
    password:"Sfdc@12345"
})
mySQLCon.connect(function(err){
    if(err) throw err;
    console.log('MYSQL Connection Established Successfully');
})

//Start : MySQL Methods

//Reset MySQL database
let createSnapShotDB = async dbName =>{
    let curDt =new Date(Date.now());
    let dt = curDt.getDate();
    let month = curDt.getMonth();
    let fYear = curDt.getFullYear();
    let hrs = curDt.getHours();
    let mins = curDt.getMinutes();
    let secs = curDt.getSeconds();
    let customDBName = dbName + dt + month + fYear + hrs + mins + secs;
    console.log(1);
    let cDB = createDB(customDBName);
    console.log(2);
    await cDB.then((result)=>console.log(JSON.stringify(result)));    
    console.log(3);
    console.log(':::: Database is created successfully ::::');
    let setDB = contextDB(customDBName);
    await setDB.then((result)=>{
        console.log('Database Switch is Successfull:::' + JSON.stringify(result));
    });
    await createMetadataTablePromise().then((result)=>{
        console.log(':::: Table created successfully ::::' + JSON.stringify(result));
    });
    console.log(4);
 
    // Salesforce Describe Metadata Callout
    const response = await fetch('http://localhost:3001/DescribeMetaData');
    let metaData = await response.json();
    console.log(metaData.metadataObjects);
    console.log(5);

    await insertMetadata(metaData.metadataObjects).then((result)=>{
        console.log('Record is inserted successfully');
        console.log(JSON.stringify(result));
    });

}

//Insert metadata into MetadataObjects Table
let insertMetadata = (metaData)=>{    
    let sqlData = metaData;//JSON.stringify(metaData);
    let sql = `INSERT INTO MetadataObjects(DirectoryName,InFolder,MetaFile,Suffix,XmlName) values ?`;    
    return new Promise((resolve,reject)=>{
        mySQLCon.query(sql,
        [sqlData.map(data=>[data.directoryName,data.inFolder,data.metaFile,data.suffix,data.xmlName])],
        function(err, result){
            if(err) reject(err);
            resolve(result);
        });        
    });
}

//Verify if Database with provide name exists in MYSQL server..
let isDBExists = dbName => {
    mySQLCon.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA',function(err,result){
        console.log('Result of Database names query :::' + JSON.stringify(result));  
        let isMatchFound = false;
        result.forEach(obj=>{
            console.log(obj.SCHEMA_NAME);
            if(obj.SCHEMA_NAME == dbName){
                console.log('Inside If Statement...');
                isMatchFound = true;
            }
        });

        if(isMatchFound == true){
            console.log('Database Match is Found:::');            
        }else{
            console.log('Database Match is not Found::::');
        }

        return isMatchFound;
    });
};

//Create MySQL DB
let createDB = dbName =>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query(`CREATE DATABASE ${dbName}`,function(err,result){        
            if(err) reject(err);
    
            resolve(result);  
        });
    });
}

//Set Context Database
let contextDB = (dbName)=>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query(`USE ${dbName}`,(error,results,fields)=>{
            if(error) reject(error);
            resolve(results);
        });
    });
}

// Delete MySQL DB
let delDB = dbName =>{
    console.log(4);
    return new Promise((resolve,reject)=>{
        mySQLCon.query(`DROP DATABASE ${dbName}`,function(err,result){
            if(err) reject(err);
    
            resolve(result);
        });
    });
}

//Create Metadata Table

let createMetadataTablePromise = ()=>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query('CREATE TABLE MetadataObjects(DirectoryName varchar(255),childXmlNames varchar(255),InFolder varchar(255),MetaFile varchar(255),Suffix varchar(255),XmlName varchar(255))',function(err,result){
            if(err) reject(err);
            resolve(result);
        });
    });
}

//Salesforce API Get Methods
app.get('/',(req,res)=>{
    conn.query("SELECT Id,Name FROM Account",(err,result)=>{
        if(err){
            res.send(err)
        }else{
            console.log('Total Records' + result.totalSize)
            res.json(result.records)
        }
        
    })    
})

app.get('/QueryCallBackStyle',(req,res)=>{
    var records=[];
    conn.query("SELECT Id,Name FROM Account",function(err,result){
        if(err){return console.error(err);}
        console.log("total : " + result.totalSize);
        res.json(result.records); 
    });
})

app.get('/QueryEventDrivenStyle',(req,res)=>{
    var records =[];
    var query = conn.query("SELECT Id, Name FROM Account")
        .on("record",function(record){
            records.push(record);
        })
        .on("end",function(){
            console.log("Total in database : " + query.totalSize);
            console.log("Total fetched : " + query.totalFetched); 
            res.json(records);                        
        })
        .on("error",function(err){
            console.error(err);
        })
        .run({autoFetch : true, maxFetch : 4000});        
})

app.get("/WildCardFields",(req,res)=>{
    conn.sobject("Contact")
    .find({LastName:'test'})
    .execute(function(err,records){
        if(err){return console.error(err);}
        res.json(records);
        console.log(records);
    });
})

app.get('/Search',(req,res)=>{
    conn.search("FIND {Un*} IN ALL FIELDS RETURNING Account(Id,Name),Lead(Id,Name)",
        function(err,result){
            if(err){return console.error(err);}
            res.json(result);
        }
    );
})

app.get('/CRUD',(req,res)=>{
    conn.sobject("Account").retrieve('0019000000CGOQ1AAP',function(err,account){
        if(err){return console.error(err);}
        console.log("Name : " + account.Name);
        res.json(account.Name);
    });
})


app.get('/CRUDMultipleRecs',(req,res)=>{

    conn.sobject("Account").retrieve([
        '0019000000CGOQ1AAP',
        '0019000000CGOQ6AAP'
    ],function(err,accounts){
        let accountNames=[];
        if(err){return console.error(err);}
        
        accounts.forEach((rec)=>{
            accountNames.push(rec.Name);
        });

        res.json(accountNames);
    });
})

app.get('/CreateRec',(req,res)=>{

    conn.sobject("Account").create({Name : "My Account #1"},function(err,ret){
        if(err || !ret.success){return console.error(err,ret);}
        console.log("Created record id : " + ret.id);
    })

})

app.get('/DescribeMetaData',(req,res)=>{
    conn.metadata.describe('52.0',function(err,metadata){
        if(err){return console.error('err',err);}
        res.json(metadata);        
            var meta = metadata;
            console.log("organizationNamespace : " + meta.organizationNamespace);
            console.log("partialSaveAllowed : " + meta.partialSaveAllowed);
            console.log("testRequired : " + meta.testRequired);
            console.log("metadataOBjects count: " + meta.metadataObjects.length);
        
    });
})

app.get("/MetadataList",(req,res)=>{
    var types = [{type : 'CustomObject',folder:null}];
    conn.metadata.list(types,'52.0',function(err,metadata){
        res.json(metadata);
        if(err){return console.error('err',err);}
        var meta = metadata[0];
        console.log('metadata count : ' + metadata.length);
        console.log('createdById : ' + meta.createdById);
        console.log('createdByName : ' + meta.createdByName);
        console.log('createdDate : ' + meta.createdDate);
        console.log('fileName : ' + meta.fileName);
        console.log('fullName : ' + meta.fullName);
        console.log('id : ' + meta.id);
        console.log('lastModifiedById : ' + meta.lastModifiedById);
        console.log('lastModifiedByName : ' + meta.lastModifiedByName);
        console.log('lastModifiedDate : ' + meta.lastModifiedDate);
        console.log('manageableState : ' + meta.manageableState);
        console.log('namespacePrefix : ' + meta.namespacePrefix);
        console.log('type : ' + meta.type);
    });
})

app.get("/ReadProfile",(req,res)=>{
    var pName = ['Admin'];
    conn.metadata.read('Profile',pName,function(err,metadata){
        res.json(metadata);
        if(err){return console.error('err',err);}        
    });
})

app.listen(PORT, ()=>{
    console.log(`Server is running at http://localhost:${PORT}`)
})