import getRunningConfig from "./config/running_config";
import crawlSingleUrl from "./utils/single_url_crawler";
import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { benignLogger, phishyLogger } from "./utils/logger";
import dumpCrawledResults from "./utils/dump_results";
import { checkLock, releaseLock } from "./utils/crawl_lock";

let mongodbClient: MongoClient;

const isBenign = true;

const runningConfig = getRunningConfig(isBenign);
const runningLogger = isBenign ? benignLogger : phishyLogger;

(async () => {
    if (checkLock(runningLogger, isBenign)) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second to write log.
        process.exit(0);
    }

    try {
        // Connect to MongoDB.
        mongodbClient = new MongoClient(runningConfig.mongodbConnString);
        await mongodbClient.connect();
        const mongodbDatabase = mongodbClient.db("benign_urls");
        const mongodbCollection = mongodbDatabase.collection("test");

        const pgPool = new Pool({
            host: runningConfig.postgrelConnConfig.host,
            port: runningConfig.postgrelConnConfig.port,
            user: runningConfig.postgrelConnConfig.user,
            password: runningConfig.postgrelConnConfig.password,
            database: runningConfig.postgrelConnConfig.database, // Specify your database
        });

        // Execute PostgreSQL query
        const executeQuery = (querySql: string): Promise<any[]> => {
            return new Promise((resolve, reject) => {
                pgPool.query(querySql, (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(result.rows); // Return rows instead of whole result
                });
            });
        };

        const querySql =
            "SELECT url FROM crux_top_urls WHERE is_crawled is false LIMIT 10";
        // const querySql =
        //     "SELECT url FROM benign.crux_top_urls WHERE id >=23067 AND is_completed = false;";
        // const querySql = "SELECT url FROM benign.crux_top_urls WHERE status_code >= 400 AND status_code < 500 AND last_crawled_time < '2024-08-19 21:30:00'";

        const queryResults = await executeQuery(querySql);
        const urls = queryResults.map((row: { url: string }) => row.url);

        runningLogger.info(`This batch contains ${urls.length} URLs`);

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
                await dumpCrawledResults(
                    isBenign,
                    url,
                    crawled_result[0],
                    pgPool,
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

        await pgPool.end();

        await mongodbClient.close();
        console.log("MongoDB connection closed.");
    } catch (runningError) {
        runningLogger.error(`Error during execution: ${runningError}`);
    } finally {
        releaseLock(runningLogger, isBenign);
        process.exit(0);
    }
})();

process.on("SIGINT", () => {
    console.log("Received SIGINT. Exiting gracefully...");
    releaseLock(runningLogger, isBenign);
    process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    releaseLock(runningLogger, isBenign);
    process.exit(1);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    releaseLock(runningLogger, isBenign);
    process.exit(1);
});
