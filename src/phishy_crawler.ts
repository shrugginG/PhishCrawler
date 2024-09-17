import getRunningConfig from "./config/running_config";
// import crawlSingleUrl from './utils/single_url_crawler'
import crawlSingleUrl from "./utils/single_phishy_url_crawler";
import mysql, { Pool } from "mysql";
import { MongoClient } from "mongodb";
import { benignLogger, phishyLogger } from "./utils/logger";
import dumpCrawledResults from "./utils/dump_results";
import { checkLock, releaseLock } from "./utils/crawl_lock";

let mongodbClient: MongoClient;
let mysqlConnPool: Pool;

const isBenign = false;

const runningConfig = getRunningConfig(isBenign);
const runningLogger = isBenign ? benignLogger : phishyLogger;

const executeQuery = (querySql: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        mysqlConnPool.query(querySql, (error, queryResults) => {
            if (error) {
                return reject(error);
            }
            resolve(queryResults);
        });
    });
};

(async () => {
    if (checkLock(runningLogger)) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second to write log.
        process.exit(0);
    }

    try {
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
            charset: runningConfig.mysqlConnConfig.charset,
        });

        // const querySql = "SELECT url FROM phishy.test WHERE is_accessible is null LIMIT 100";
        // const querySql = "SELECT url FROM phishy.phishy_urls WHERE is_crawled = TRUE AND id > 332046 AND title = 'Suspected phishing site | Cloudflare'"
        const querySql =
            "SELECT url FROM phishy.phishy_urls WHERE is_crawled = FALSE AND id > 332046";

        const queryResults = await executeQuery(querySql);

        const urls = queryResults.map((row: { url: string }) => row.url);
        runningLogger.info(`This batch contains ${urls.length} URLs.`);

        async function processUrlsBatch(urlsBatch: string[]) {
            const promises = urlsBatch.map(async (url) => {
                const crawled_result = await crawlSingleUrl(
                    url,
                    runningConfig.userDataDir,
                    runningConfig.archiveDir,
                    runningLogger,
                );
                runningLogger.info(
                    `${(crawled_result[0] as any)["_id"]} | Crawled result: ${JSON.stringify(crawled_result[1])}`,
                );
                // console.log(crawled_result[1]);
                await dumpCrawledResults(
                    isBenign,
                    url,
                    crawled_result[0],
                    mysqlConnPool,
                    mongodbCollection,
                    runningLogger,
                );
            });

            await Promise.all(promises);
        }

        const batchSize = 7;
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
    } catch (runningError) {
        runningLogger.error(`Error during execution: ${runningError}`);
    } finally {
        releaseLock(runningLogger);
        process.exit(0);
    }
})();

process.on("SIGINT", () => {
    console.log("Received SIGINT. Exiting gracefully...");
    releaseLock(runningLogger);
    process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    releaseLock(runningLogger);
    process.exit(1);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    releaseLock(runningLogger);
    process.exit(1);
});

