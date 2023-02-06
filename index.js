
/**Salesforce Libraries*/
import express from 'express';
import jsforce from 'jsforce';

/**Read CSV File Library */
import * as fs from 'fs';
import fastCSV from 'fast-csv';
import csvParser from 'csv-parser';

import child_process from 'child_process';

/**Load Env file*/
import dotenv from 'dotenv';
import fetch from 'node-fetch';

/**MySQL Libraries*/
import mysql from 'mysql2';
dotenv.config()



/**Salesforce connection*/
const {SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_TOKEN,SQL_USERNAME, SQL_PASSWORD,SQL_HOST,SQL_PORT,TEMPLATE_DB}=process.env

/**Setup Port on which Node will run*/
const app = express()
const PORT = SQL_PORT

//Establish connection to Salesforce instance
const conn = new jsforce.Connection({
    loginUrl:SF_LOGIN_URL
})

conn.login(SF_USERNAME,SF_PASSWORD+SF_TOKEN,(err,userInfo)=>{
    if(err){
        //console.log(err)
    }else{
        //console.log('User Id:' + userInfo.id)
        //console.log('Org Id:' + userInfo.organizationId)
        //Create a database after successfully establishing Salesforce Connection. This call will later be done separately
        createSnapShotDB('LTIMindtree');
    }
})

/**MySQL connection*/
var mySQLCon = mysql.createConnection({
    host:SQL_HOST,
    user:SQL_USERNAME,
    password:SQL_PASSWORD
})

mySQLCon.connect(function(err){
    if(err) throw err;
    //console.log('MYSQL Connection Established Successfully');
})

/*Call to this method performs below tasks
    1. Creates a new database 
    2. Sets the context of running user to the new database
    3. Call createMetadataTypesTablePromise to create the Salesforce MetadataType table in the DB
    4. Call below API to fetch all MetadataTypes from Salesforce
    5. Insert Metadatatypes into MetadataTypes table
    6. Call promise that creates MetadataCatalog table
    6.1 Prepare for MetadataCatalog Callout
    7. Insert MetadataCatalog in MySQL database table
*/
let createSnapShotDB = async dbName =>{
    
    let curDt =new Date(Date.now());
    let dt = curDt.getDate();
    let month = curDt.getMonth()+1;
    let fYear = curDt.getFullYear();
    let hrs = curDt.getHours();
    let mins = curDt.getMinutes();
    let secs = curDt.getSeconds();
    let customDBName = dbName + dt + month + fYear + hrs + mins + secs;
    
    /* 1. Call ceateDB method to send request to MYSQL database for creation of new DB*/
    //let cDB = createDB(customDBName);
    let cDB = createNewDB(customDBName);
    await cDB.then((result)=>console.log(result)).catch(error => {
        console.error(error);
      });;
    console.log(':::: Database is created successfully ::::');
    
    /* 2. Call contextDB method to set the context to the new Database created above*/
    let setDB = contextDB(customDBName);
    await setDB.then((result)=>{
        console.log('Database Switch is Successfull:::' + JSON.stringify(result));
    });

    /** 2.1 Create Saleforce metadata tables */
    const options = {
        objectMode: true,
        delimiter: ",",
        quote: null,
        headers: true,
        renameHeaders: false,
      };

    let objectsAndFields = [];


    // const readableStream = fs.createReadStream("C:\\Daniel\\SalesforceProjects\\Nodejs\\MetadataTypesAndFields.csv", { encoding: 'utf8' });
    // console.log(readableStream);
    // await readableStreamEventPromise(readableStream).then(data=>{
    //     console.log(data);
    // });

    await readObjectsAndFieldsFile('C:\\Daniel\\SalesforceProjects\\Nodejs\\MetadataTypesAndFields.csv').then(data => {
        console.log('Inside csv reading method');
        console.log(data);
        objectsAndFields = [...data];
    })
    .catch(error => {
        console.error(error);
    });

    // const readableStream = fs.createReadStream("C:\\Daniel\\SalesforceProjects\\Nodejs\\MetadataTypesAndFields.csv", { encoding: 'utf8' });

    // readableStream.on("readable", () => {
    //   let chunk;
    //   while (null !== (chunk = readableStream.read())) {
    //     console.log(`Received ${chunk.length} bytes of data.`);
    //   }
    // });
    
    // fastCSV
    //     .parseStream(readableStream, options)
    //     .on("error", (error) => {
    //         console.log(error);
    //     })
    //     .on("data", (row) => {
    //         data.push(row);
    //     })
    //     .on("end", (rowCount) => {
    //     console.log('Inside csv reading method');
    //     console.log(rowCount);
    //     console.log(data);
    //     });
    
    /***2.1.2 Convert the list of tables and columns data into a Map where table name is the key and field names are array of values  */

    let objectsAndFieldsMap = convertObjectsAndFieldsToMap(objectsAndFields);
    if(objectsAndFieldsMap === null || objectsAndFieldsMap === undefined || objectsAndFieldsMap.size  === 0){
        console.log('Exiting from the Javascript execution as length of objectsAndFieldsMap is 0 or the objectsAndFieldsMap is null');
        process.exit(1);
    }

    /* 3. Call createMetadataTypesTablePromise to create the Salesforce MetadataType table in the DB*/
    // await createMetadataTypesTablePromise().then((result)=>{
    //     //console.log(':::: Table created successfully ::::' + JSON.stringify(result));
    // });
    
    /* 4. Call below API to fetch all MetadataTypes from Salesforce*/
    const response = await fetch(`http://127.0.0.1:${PORT}/DescribeMetaData`);
    let metaData = await response.json();
    //console.log(5);
    
    /** 5. Insert Metadatatypes into MetadataTypes table */
    let metadataTypeList = metaData.metadataObjects.map(obj=>obj.xmlName);
    metadataTypeList = ['CustomObject'];
    //console.log(metadataTypeList);
    await insertMetadataTypes(metaData.metadataObjects).then((result)=>{
         //console.log('Record is inserted successfully');
         //console.log(JSON.stringify(result));
     });
    
    /** 6. Call promise that creates MetadataCatalog Table*/
    // await createMetadataCatalogTablePromise().then((response)=>console.log('MetadataCatalog table created successfully'+JSON.stringify(response)));
    let metadataCatalog = [];
    
    
    /*** 6.1 Prepare for MetadataCatalog Callout */
    await callOutMetadataCatalogPromise(metaData.metadataObjects).then(
    result=>{
        metadataCatalog.push([...result])
    });
    console.log('33333333:::')    
    console.log('MetadataCatalog Size :::' + metadataCatalog.flat().length);
    
    // 7. Insert MetadataCatalog in MySQL database table
    await insertMetadataCatalog(metadataCatalog).then(result=>console.log('MetadataCatalog Insert Result ::::: '));
    
    // 8. Create tables for individual Metadata Types using metadataCatalog
    
    // 8.1 Create a set of metadata types
    const mTypes = metadataCatalog[0].map(item => item.type);
    //console.log('mTypes ::: ' + JSON.stringify(mTypes));
    let mTypeSet = [...new Set(mTypes)];

    /* 8.2 
        1. Iterate through MetaData Type Set
        2. Identify individual metadata records
        3. Perform bulk parallel callouts for each metadata type
        4. Process the response of each MetadataType and insert the records into table
    */
     let metadataResult = await callOutMetadataTypeAndName(metadataCatalog[0],mTypeSet);
     
    //Call handleMetadataResult method to process the result and create individual tables
    handleMetadaResult(metadataTypeList,metadataResult,objectsAndFieldsMap);
    
    /*** Call custom object processing method */
    // 8.3 
    //console.log('444444::::::');

}

/** Readable Stream Event promise */
let readableStreamEventPromise = (readableStream) => {
    return new Promise((resolve,reject)=>{
        readableStream.on("readable", () => {
            let chunk;
            while (null !== (chunk = readableStream.read())) {
              console.log(`Received ${chunk.length} bytes of data.`);
              resolve('Readable Event is fired');
            }
          });
    });    
}


/**Read Metadata and Fields from file */
let readObjectsAndFieldsFile = (filePath)=>{
    return new Promise((resolve, reject) => {
        let data=[];
        // fastCSV
        //     .parseStream(readableStream, options)
        //     .on("error", (error) => {
        //         reject(error);
        //     })
        //     .on("data", (row) => {
        //         data.push(row);
        //     })
        //     .on("end", (rowCount) => {
        //         resolve(data);
        //     });

        fs.createReadStream(filePath)
        .pipe(csvParser({ encoding: 'utf8' }))
        .on('data', (row) => {
          console.log(row);
          data.push(row);
        })
        .on('end', () => {
          console.log('CSV file successfully processed');
          resolve(data);
        });
    });
}


/**Convert list of Objects and Fields to Map*/
let convertObjectsAndFieldsToMap = (data)=>{
    let map = new Map();
    for (let obj of data) {
        if (!map.has(obj.Object_Name)) {
          map.set(obj.Object_Name, [[obj.Field_Name]+'-'+[obj.MySQL_DataType]]);
        } else {
          let fieldNames = map.get(obj.Object_Name);
          fieldNames.push([obj.Field_Name]+'-'+[obj.MySQL_DataType]);
          map.set(obj.Object_Name, fieldNames);
        }
    }
    return map;
}


/** Process metadata call out response and call individual process methods using switch  */
let handleMetadaResult = (metadataTypeList,result,objectsAndFieldsMap)=>{

    let metadataMap = new Map();
    
    metadataTypeList.forEach(oType=>{
        let mList = result.map(res=>{
            if(res.value?.customType==oType){
                return res!==undefined && res!=='undefined'?res:null;
            }
        }).filter(function(value) {
            return value !== undefined;
          });
        metadataMap.set(oType,mList);
    })

    for(let key of metadataMap.keys()){
        switch(key){
            case 'CustomObject':
                processCustomObject(result.map(obj=>obj?.value?.customType=='CustomObject'?obj:undefined).filter(value=>value!==undefined),'CustomObject',objectsAndFieldsMap.get('CustomObject'));
                break;
            case 'Profile':
                processProfiles(result.map(obj=>obj?.value?.customType=='Profile'?obj:undefined).filter(value=>value!==undefined));
                break;
        }
    }

}

/***Create new database instance */
let createNewDB=(customDBName)=>{
    return new Promise((resolve,reject)=>{
        const mysqldump = `mysqldump -u ${SQL_USERNAME} -p${SQL_PASSWORD} ${TEMPLATE_DB}`;
        const createDB = `mysql -u ${SQL_USERNAME} -p${SQL_PASSWORD} -e "CREATE DATABASE ${customDBName}"`;
        console.log(SQL_USERNAME);
        child_process.exec(mysqldump, (error, stdout, stderr) => {
            if (error || (stderr !== null && stderr !== undefined && !stderr.includes("Warning"))) {
                console.error(`exec error: ${error}`);
                reject(error);
            }
            //resolve(stdout);
            //console.log(`stdout: ${stdout}`);
            //console.log(`stderr: ${stderr}`);
            fs.writeFileSync(`${TEMPLATE_DB}.sql`, stdout);
            child_process.exec(createDB, (error, stdout, stderr) => {
                if (error || (stderr !== null && stderr !== undefined && !stderr.includes("Warning"))) {
                    console.error(`exec error: ${error}`);
                    reject(error);
                }
                //console.log(`stdout: ${stdout}`);
                //console.log(`stderr: ${stderr}`);
                child_process.exec(`mysql -u ${SQL_USERNAME} -p${SQL_PASSWORD} ${customDBName} < ${TEMPLATE_DB}.sql`, (error, stdout, stderr) => {
                    if (error || (stderr !== null && stderr !== undefined && !stderr.includes("Warning"))) {
                        console.error(`exec error: ${error}`);
                        reject(error);
                    }
                    /**if stdout is null or undefined though the process is sucess then assign success value */
                    if((stdout == null && stdout !== undefined)){
                        stdout = 'Success';
                    }
                    resolve(stdout);
                    //console.log(`stdout: ${stdout}`);
                    //console.log(`stderr: ${stderr}`);
                });
            });
        });
    });
}


/**Process CustomObject, create table and insert data in MySQL */

let processCustomObject = async (metaData,tableName,columns)=>{

    console.log(metaData);
    //insertCustomObject(metadata);
    //await insertCustomObject(metadata).then(result=>console.log('Custom Object Created Susccessfully ::::: '));

    // let tableName = 'customobject';
    // let columns = ['actionOverrides', 'compactLayoutAssignment', 'enableFeeds', 'externalSharingModel', 'fields', 'fullName', 'label', 'listViews', 'sharingModel'];

    // await insertIntoTable(tableName, columns, metaData).then(result => console.log(result)).catch(err => console.error(err));
    //tableName = 'customobject';
    //columns = ['actionOverrides', 'compactLayoutAssignment', 'enableFeeds', 'externalSharingModel', 'fields', 'fullName', 'label', 'listViews', 'sharingModel','searchLayouts'];
    let values = mapValues(tableName,columns,metaData);//metaData.map(data => [JSON.stringify(data.value.actionOverrides), data.value.compactLayoutAssignment, data.value.enableFeeds ? 1 : 0, data.value.externalSharingModel, JSON.stringify(data.value.fields), data.value.fullName, data.value.label, JSON.stringify(data.value.listViews), data.value.sharingModel]);

    await insertMetaData(tableName, columns, values)
        .then(result => {
            console.log('Result::::' + `${tableName} data inserted successfully`);
        })
        .catch(err => {
            // handle the error
        });
}

function mapValues(tableName, columns, metaData) {
    let values = metaData.map(data => {
      let row = [];
      columns.forEach(column => {
        const str = column;
        const parts = str.split('-');
        const col = parts[0];
        const dataType = parts[1];
        let value = data.value[col];
        //if (typeof value === 'object') value = JSON.stringify(value);
        if (value === 'false' || value === 'true') value = (value==='true') ? 1 : 0;
        //if (dataType === 'JSON' && !isValidJSON()) value = null;

        if (dataType === 'JSON'){
            if (typeof value === 'object'){
                value = JSON.stringify(value);
            }else{
                value = null;
            }
        }
        
        //if (dataType === 'JSON' && (value === undefined || value === null)){ let tmpJSON = [{"Key":"TestValue"}];value = JSON.stringify(tmpJSON);}
        //if(column === 'searchLayouts') value = null;
        row.push(value);
      });
      return row;
    });
    return values;
  }

  /** Verify if string is valid JSON object */
  function isValidJSON(string) {
    try {
      JSON.parse(string);
      return true;
    } catch (error) {
      return false;
    }
  }



/**Process Profiles, create table and insert data in MySQL */

let processProfiles = (metadata)=>{

    //console.log(metadata);

}


/*** Callout to get Metadata of specific type*/
let callOutMetadataTypeAndName = async (metadataCatalog,mTypeSet)=>{
    // const keys = Object.keys(metadataCatalog);
    mTypeSet = ['CustomObject'];
    let urls = [];
    let finalResult=[];
    // mTypeSet.forEach(async mtype=> {
    //     const filteredData = metadataCatalog.filter(meta => meta.type == mtype);
    //     //console.log('Filtered Values :::' + JSON.stringify(filteredData));
    //     // const apiPromises = filteredData.map(item => {
    //     //     const url = `http://127.0.0.1:${PORT}/metadata?type=${item.type}&name=${item.fullName}`;
    //     //     return fetch(url).then(response => response.json());
    //     // });
    //     // await Promise.all(apiPromises).then(results => {
    //     //     //console.log('Results convertJSONToTables :::' + JSON.stringify(results));
    //     //   });

    mTypeSet.forEach(async mtype=> {
        const filteredData = metadataCatalog.filter(meta => meta.type == mtype);
        //console.log('Filtered Values :::' + JSON.stringify(filteredData));
        let tmpUrls = filteredData.map(item=>{
            return {'type':mtype,'url':`http://127.0.0.1:${PORT}/metadata?type=${item.type}&name=${item.fullName}`}
    });
        urls.push([...tmpUrls]);
    });
    urls = urls.flat();
    //console.log(urls);
    await Promise.allSettled(
        urls.map(urlObj=>fetch(urlObj.url).then(resp=>resp.json().then(obj=>{
            let tmpObj = {...obj};
            tmpObj['customType']=urlObj.type;
            return tmpObj;
        }))))
        .then(requests=> finalResult = requests.flat()).catch(()=>null);

    //console.log('***********%%%%%%%%%%%%%%**********' + finalResult);

    return finalResult;
}


/**MetadataCatalog Callout Promise*/
let callOutMetadataCatalogPromise = async (metadata)=>{
    let mTypeList = [];
    let i=0;
    let eliminatedTypes = ['EntitlementTemplate','MLDataDefinition','PlatformEventChannel','PlatformEventChannelMember',
                            'CallCenter','MilestoneType','EntitlementProcess','AppointmentSchedulingPolicy',
                        'CanvasMetadata','MobileApplicationDetail','CustomNotificationType','ConnectedApp','AppMenu',
                    'NotificationTypeConfig','DelegateGroup','BrandingSet','ManagedContentType','SiteDotCom',
                    'NetworkBranding','FlowCategory','LightningBolt','LightningExperienceTheme','LightningOnboardingConfig',
                    'CustomHelpMenuSection','Prompt','SamlSsoConfig','CorsWhitelistOrigin','ActionLinkGroupTemplate',
                    'TransactionSecurityPolicy','SynonymDictionary','PathAssistant','AnimationRule','LeadConvertSettings',
                    'LiveChatSensitiveDataRule','PlatformCachePartition','TopicsForObjects','AccessControlPolicy',
                    'RestrictionRule','FieldRestrictionRule','RecommendationStrategy','EntityImplements','EmailServicesFunction',
                    'PaymentGatewayProvider','GatewayProviderPaymentMethodType','RecordActionDeployment','EmbeddedServiceConfig',
                    'EmbeddedServiceBranding','EmbeddedServiceFlowConfig','EmbeddedServiceMenuSettings','CallCoachingMediaProvider',
                    'PlatformEventSubscriberConfig','Settings'
                ]
    metadata.forEach(meta=>{
        if(!eliminatedTypes.includes(meta.xmlName)
        ){                   
            mTypeList.push(meta.xmlName)
        }        
    });
    //console.log(mTypeList);
    return new Promise(async (resolve,reject)=>{
    let results = await Promise.all( mTypeList.map(mType =>
        fetch(`http://127.0.0.1:${PORT}/MetadataList?mType=${mType}`).then(resp=>resp.json().then(obj=>obj))
        )).then(result=>{
            let finalResult = result.flat();
            resolve(finalResult);
        });        
    })
}

/**Insert Custom Object data into CustomObject Table*/
// let insertCustomObject = (metaData)=>{    
//     let sqlData = metaData;//JSON.stringify(metaData);
//     let sql = `INSERT INTO customobject(actionOverrides,compactLayoutAssignment,enableFeeds,externalSharingModel,fields,fullName,label,listViews,sharingModel) values ?`;
//     let prm;
//     if(sqlData !== null && sqlData !== undefined){
//         prm = new Promise((resolve,reject)=>{
//                 mySQLCon.query(sql,
//                 [sqlData.map(data=>[JSON.stringify(data.value.actionOverrides),data.value.compactLayoutAssignment,data.value.enableFeeds?1:0,data.value.externalSharingModel,JSON.stringify(data.value.fields),data.value.fullName,data.value.label,JSON.stringify(data.value.listViews),data.value.sharingModel])],
//                 function(err, result){
//                     if(err) reject(err);
//                     resolve(result);
//                 });        
//         });
//     }    
//     return prm;
// }
// let insertCustomObject = (tableName, columns, data) => {
//     let sql = `INSERT INTO ${tableName} (${columns.join(',')}) values ?`;
//     let prm;
//     if (data !== null && data !== undefined) {
//         prm = new Promise((resolve, reject) => {
//             mySQLCon.query(sql,
//                 [data.map(row => columns.map(col => row[col]))],
//                 function (err, result) {
//                     if (err) reject(err);
//                     resolve(result);
//                 });
//         });
//     }
//     return prm;
// }

let insertMetaData = (tableName, columns, values) => {

    let cols = columns.map(c=>{
        let parts = c.split('-');
        return parts[0];
    });

    // values.map((val)=>{
    //     isValidJSON(val)
    // })
    

    return new Promise((resolve, reject) => {
        let sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES ?`;
        
        //let formattedValues = values.map(value => value.map(val => val === 'JSON.NULL' ? {null} : val));

        // mySQLCon.query(sql, [formattedValues], function(err, result) {
        //     if (err) reject(err);
        //     resolve(result);
        // });

        console.log(values);

        mySQLCon.query(sql, [values.map(value => [...value])], function(err, result) {
            if (err) reject(err);
            resolve(result);
        });
    });
};






/**Insert metadata into MetadataCatalog Table*/
let insertMetadataCatalog = (metaData)=>{    
    let sqlData = metaData[0];//JSON.stringify(metaData);
    let sql = `INSERT INTO MetadataCatalog(CreatedById,CreatedByName,CreatedDate,FileName,FullName,Id,LastModifiedById,LastModifiedByName,LastModifiedDate,ManageableState,Type) values ?`;
    let prm;
    if(sqlData !== null && sqlData !== undefined){
        prm = new Promise((resolve,reject)=>{
                mySQLCon.query(sql,
                [sqlData.map(data=>[data.createdById,data.createdByName,data.createdDate,data.fileName,data.fullName,data.id,data.lastModifiedById,data.lastModifiedByName,data.lastModifiedDate,data.manageableState,data.type])],
                function(err, result){
                    if(err) reject(err);
                    resolve(result);
                });        
        });
    }    
    return prm;
}

/**Insert into MetadataTypes Table*/
let insertMetadataTypes = (metaData)=>{    
    let sqlData = metaData;//JSON.stringify(metaData);
    let sql = `INSERT INTO MetadataTypes(DirectoryName,InFolder,MetaFile,Suffix,XmlName) values ?`;    
    return new Promise((resolve,reject)=>{
        mySQLCon.query(sql,
        [sqlData.map(data=>[data.directoryName,data.inFolder,data.metaFile,data.suffix,data.xmlName])],
        function(err, result){
            if(err) reject(err);
            resolve(result);
        });        
    });
}

/**Create MySQL DB*/
let createDB = dbName =>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query(`CREATE DATABASE ${dbName}`,function(err,result){        
            if(err) reject(err);
    
            resolve(result);  
        });
    });
}

/**Set Context Database*/
let contextDB = (dbName)=>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query(`USE ${dbName}`,(error,results,fields)=>{
            if(error) reject(error);
            resolve(results);
        });
    });
}

/*** Create MetadataTypes Table */
let createMetadataTypesTablePromise = ()=>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query('CREATE TABLE MetadataTypes(DirectoryName varchar(255),childXmlNames varchar(255),InFolder varchar(255),MetaFile varchar(255),Suffix varchar(255),XmlName varchar(255))',function(err,result){
            if(err) reject(err);
            resolve(result);
        });
    });
}

/*** Create MetadataCatalog Table */
let createMetadataCatalogTablePromise = ()=>{
    return new Promise((resolve,reject)=>{
        mySQLCon.query('CREATE TABLE MetadataCatalog(CreatedById Varchar(255),CreatedByName Varchar(255),CreatedDate Varchar(255),FileName Varchar(255),FullName Varchar(255),Id Varchar(255),LastModifiedById Varchar(255),LastModifiedByName Varchar(255),LastModifiedDate Varchar(255),ManageableState Varchar(255),Type Varchar(255))',function(err,result){
            if(err) reject(err);
            resolve(result);
        });
    });
}

/*** Salesforce API Get Methods */ 
app.get('/',(req,res)=>{
    conn.query("SELECT Id,Name FROM Account",(err,result)=>{
        if(err){
            res.send(err)
        }else{
            //console.log('Total Records' + result.totalSize)
            res.json(result.records)
        }
        
    })    
})

app.get('/QueryCallBackStyle',(req,res)=>{
    var records=[];
    conn.query("SELECT Id,Name FROM Account",function(err,result){
        if(err){return console.error(err);}
        //console.log("total : " + result.totalSize);
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
            //console.log("Total in database : " + query.totalSize);
            //console.log("Total fetched : " + query.totalFetched); 
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
        //console.log(records);
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
        //console.log("Name : " + account.Name);
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
        //console.log("Created record id : " + ret.id);
    })

})

app.get('/DescribeMetaData',(req,res)=>{
    conn.metadata.describe('52.0',function(err,metadata){
        if(err){return console.error('err',err);}
        res.json(metadata);        
            var meta = metadata;
            //console.log("organizationNamespace : " + meta.organizationNamespace);
            //console.log("partialSaveAllowed : " + meta.partialSaveAllowed);
            //console.log("testRequired : " + meta.testRequired);
            //console.log("metadataOBjects count: " + meta.metadataObjects.length);
        
    });
})

app.get("/MetadataList",(req,res)=>{
    try{
        //console.log('Inside Metadata List::0' +req.query.mType );
        var types = [{type : req.query.mType,folder:null}];
        //console.log('Inside Metadata List::1');
        conn.metadata.list(types,'52.0',function(err,metadata){
            //console.log('Inside Metadata List::2');
            
            //let jsonResponse = res.json(metadata);
            //console.log('Inside Metadata List::3' + JSON.stringify(metadata));
            if(err){return //console.log('err',err);
            }
            if(metadata !== null && metadata !== undefined){
                res.json(metadata);
            }else{
                let send=[];
                res.json(send);
            }
        });

    }catch(err){
        //console.log('error in calling::: ' + JSON.stringify(req) + ' ::: Error ::::' + err);
    }
    
})

app.get("/metadata",(req,res)=>{
    let mType = req.query.type;
    let mName = req.query.name;
    conn.metadata.read(mType,mName,function(err,metadata){        
        if(err){return console.error('err',err);}    
        if(metadata !== null && metadata !== undefined){
            //let tmpMap = new Map();
            //tmpMap.set(mType,metadata);
            //let tmpArray = [];
            //tmpArray.push(mType);
            //tmpArray.push([...metadata]);
            res.json(metadata);
        }else{
            let send=[];
            res.json(send);
        }
    });
})

app.listen(PORT, ()=>{
    console.log(`Server is running at http://127.0.0.1:${PORT}`)
})