
/**Salesforce Libraries*/
import express from 'express';
import jsforce from 'jsforce';

/**Load Env file*/
import dotenv from 'dotenv';
import fetch from 'node-fetch';

/**MySQL Libraries*/
import mysql from 'mysql2';
dotenv.config()

/**Setup Port on which Node will run*/
const app = express()
const PORT = 3003

/**Salesforce connection*/
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
        //Create a database after successfully establishing Salesforce Connection. This call will later be done separately
        createSnapShotDB('LTIMindtree');
    }
})

/**MySQL connection*/
var mySQLCon = mysql.createConnection({
    host:"localhost",
    user:"root",
    password:"Sfdc@12345"
})

mySQLCon.connect(function(err){
    if(err) throw err;
    console.log('MYSQL Connection Established Successfully');
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
    let cDB = createDB(customDBName);
    await cDB.then((result)=>console.log(JSON.stringify(result)));    
    console.log(':::: Database is created successfully ::::');
    
    /* 2. Call contextDB method to set the context to the new Database created above*/
    let setDB = contextDB(customDBName);
    await setDB.then((result)=>{
        console.log('Database Switch is Successfull:::' + JSON.stringify(result));
    });
    
    /* 3. Call createMetadataTypesTablePromise to create the Salesforce MetadataType table in the DB*/
    await createMetadataTypesTablePromise().then((result)=>{
        console.log(':::: Table created successfully ::::' + JSON.stringify(result));
    });
    
    /* 4. Call below API to fetch all MetadataTypes from Salesforce*/
    const response = await fetch(`http://localhost:${PORT}/DescribeMetaData`);
    let metaData = await response.json();
    console.log(5);
    
    /** 5. Insert Metadatatypes into MetadataTypes table */
    await insertMetadataTypes(metaData.metadataObjects).then((result)=>{
         console.log('Record is inserted successfully');
         console.log(JSON.stringify(result));
     });
    
    /** 6. Call promise that creates MetadataCatalog Table*/
    await createMetadataCatalogTablePromise().then((response)=>console.log('MetadataCatalog table created successfully'+JSON.stringify(response)));
    let metadataCatalog = [];
    let metadataResult = [];
    
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
    console.log('mTypes ::: ' + JSON.stringify(mTypes));
    let mTypeSet = [...new Set(mTypes)];

    /* 8.2 
        1. Iterate through MetaData Type Set
        2. Identify individual metadata records
        3. Perform bulk parallel callouts for each metadata type
        4. Process the response of each MetadataType and insert the records into table
    */
    //
    // mTypeSet = ['CustomObject'];
    // mTypeSet.forEach(async mtype=> {
    //     const filteredData = metadataCatalog[0].filter(meta => meta.type == mtype);
    //     console.log('Filtered Values :::' + JSON.stringify(filteredData));
    //     callOutBridgeAwait(filteredData);
    // })

    await callOutMetadataTypeAndName(metadataCatalog[0]).then(
                result=>{
                    console.log(result);
                });    
    console.log('CallOutBridgeAwait *******');

    // 8.3 
    console.log('444444::::::');

}

//metadata?type=CustomObject&name=PaymentMethod


/***Callout Bridge to facilitate Await */

// let callOutBridgeAwait = async (filteredData) =>{
//     await callOutMetadataTypeAndName(filteredData).then(
//         result=>{
//             console.log(result);
//         });    
//     console.log('CallOutBridgeAwait *******');
// }


/*** Callout to get Metadata of specific type*/
let callOutMetadataTypeAndName = async (metadataCatalog,mTypeSet)=>{
    // const keys = Object.keys(metadataCatalog);
     mTypeSet = ['CustomObject','Role']
    // mTypeSet.forEach(async mtype=> {
    //     const filteredData = metadataCatalog.filter(meta => meta.type == mtype);
    //     console.log('Filtered Values :::' + JSON.stringify(filteredData));
    //     // const apiPromises = filteredData.map(item => {
    //     //     const url = `http://localhost:${PORT}/metadata?type=${item.type}&name=${item.fullName}`;
    //     //     return fetch(url).then(response => response.json());
    //     // });
    //     // await Promise.all(apiPromises).then(results => {
    //     //     console.log('Results convertJSONToTables :::' + JSON.stringify(results));
    //     //   });

        return new Promise(async (resolve,reject)=>{            
            let conResult = [];
            mTypeSet.forEach(async mtype=> {
                const filteredData = metadataCatalog.filter(meta => meta.type == mtype);
                console.log('Filtered Values :::' + JSON.stringify(filteredData));

                await Promise.all( filteredData.map(item =>
                    fetch(`http://localhost:${PORT}/metadata?type=${item.type}&name=${item.fullName}`)
                    .then(
                        resp=>resp.json()
                        .then(
                            obj=>{
                                let tmpObj = {...obj};
                                tmpObj['metaType']=item.type;
                                return tmpObj;
                            }
                            )
                        ).catch(()=>null)
                    )).then(result=>{
                        let finalResult = result.flat();
                        conResult.push(finalResult);
                });
            })
            if(conResult !== null && conResult !== undefined && conResult.length>0){
                let metaTypes = conResult.map(item => item.metaType);
                let metTypeSet = new Set(metaTypes);
                if(metTypeSet.length == mTypeSet.length){
                    resolve(conResult);
                }
            }
        })         
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
    console.log(mTypeList);
    return new Promise(async (resolve,reject)=>{
    let results = await Promise.all( mTypeList.map(mType =>
        fetch(`http://localhost:${PORT}/MetadataList?mType=${mType}`).then(resp=>resp.json().then(obj=>obj))
        )).then(result=>{
            let finalResult = result.flat();
            resolve(finalResult);
        });        
    })
}

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
    try{
        console.log('Inside Metadata List::0' +req.query.mType );
        var types = [{type : req.query.mType,folder:null}];
        console.log('Inside Metadata List::1');
        conn.metadata.list(types,'52.0',function(err,metadata){
            console.log('Inside Metadata List::2');
            
            //let jsonResponse = res.json(metadata);
            console.log('Inside Metadata List::3' + JSON.stringify(metadata));
            if(err){return console.log('err',err);
            }
            if(metadata !== null && metadata !== undefined){
                res.json(metadata);
            }else{
                let send=[];
                res.json(send);
            }
        });

    }catch(err){
        console.log('error in calling::: ' + JSON.stringify(req) + ' ::: Error ::::' + err);
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
    console.log(`Server is running at http://localhost:${PORT}`)
})