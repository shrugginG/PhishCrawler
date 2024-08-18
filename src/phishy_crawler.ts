import getRunningConfig from './config/running_config'
import crawlSingleUrl from './utils/single_url_crawler'
import mysql, { Pool } from 'mysql'
import { MongoClient } from 'mongodb'
import { benignLogger, phishyLogger } from './utils/logger'
import dumpCrawledResults from './utils/dump_results'

let mongodbClient: MongoClient;
let mysqlConnPool: Pool;

const isBenign = false;

const runningConfig = getRunningConfig(isBenign);
const runningLogger = isBenign ? benignLogger : phishyLogger;

(async () => {

    // Connect to MongoDB.
    mongodbClient = new MongoClient(runningConfig.mongodbConnString);
    await mongodbClient.connect();
    const mongodbDatabase = mongodbClient.db("phishy_urls");
    const mongodbCollection = mongodbDatabase.collection("main");

    // Connect to mysql.
    // Create mysql connection pool.
    mysqlConnPool = mysql.createPool({
        connectionLimit: 7,
        host: runningConfig.mysqlConnConfig.host,
        port: runningConfig.mysqlConnConfig.port,
        user: runningConfig.mysqlConnConfig.user,
        password: runningConfig.mysqlConnConfig.password,
        charset: runningConfig.mysqlConnConfig.charset
    });

    const querySql = "SELECT url FROM phishy.test WHERE is_accessible is null LIMIT 100";

    mysqlConnPool.query(querySql, async (error, queryResults, fields) => {
        if (error) {
            console.error(error);
            return;
        }

        const urls = queryResults.map((row: { url: string }) => row.url)

        async function processUrlsBatch(urlsBatch: string[]) {
            const promises = urlsBatch.map(async (url) => {
                const crawled_result = await crawlSingleUrl(
                    url,
                    runningConfig.userDataDir,
                    runningConfig.archiveDir,
                    runningLogger,
                )
                console.log(crawled_result[1]);
                await dumpCrawledResults(
                    isBenign,
                    url,
                    crawled_result[0],
                    mysqlConnPool,
                    mongodbCollection,
                    runningLogger
                );
            });

            await Promise.all(promises);
        }

        const batchSize = 4;
        for (let i = 0; i < urls.length; i += batchSize) {
            const urlsBatch = urls.slice(i, i + batchSize);
            await processUrlsBatch(urlsBatch);
        }

        mysqlConnPool.end((err) => {
            if (err) {
                console.error("Error closing MySQL connection pool.", err);
            } else {
                console.log("MySQL connection pool closed.");

            }
        });

        await mongodbClient.close();
        console.log("MongoDB connection closed.");

        process.exit(0);

    });


})();
