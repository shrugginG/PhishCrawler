import { Collection } from "mongodb";
import { Connection, Pool } from "mysql";
import { Logger } from "winston";
import { strHashValue } from './misc'
import { singleInsert, singleUpdate } from "./mysql_utils";

export default async function dumpCrawledResults(url: string, crawledResult: any, mysqlConn: Connection | Pool, mongodbColl: Collection, logger: Logger) {
    const urlHashValue = strHashValue(url, 'sha256');
    if (crawledResult.accessible) {
        // Define the sql statements.
        const singleUrlsUpdateSql = `UPDATE benign.crux_top_urls SET is_crawled = ?, page_url = ?, is_accessible = ?, status_code = ?, ip = ?, port = ?, title = ?, is_completed = ?, last_crawled_time = NOW() WHERE url_sha256 = ?`;
        // Try dump crawledResult to mysql.
        logger.info(`${urlHashValue} | Start to dump crawledResult into table: benign.crux_top_urls .`)
        await singleUpdate(
            mysqlConn, singleUrlsUpdateSql, [
            true,
            typeof crawledResult.page_url === 'string' ? crawledResult.page_url.substring(0, 2048) : null,
            crawledResult.accessible,
            crawledResult.statusCode,
            crawledResult.ipAddress,
            crawledResult.port,
            typeof crawledResult.title === 'string' ? crawledResult.title.substring(0, 255) : null,
            crawledResult.completed,
            urlHashValue
        ]
        ).then((changedRows) => {
            logger.info(`${urlHashValue} | Succeed to dump crawledResult into table: benign.crux_top_urls , changedRows: ${changedRows}.`)
        }).catch((updateError) => {
            logger.error(`Failed to dump crawledResult into table: benign.crux_top_urls .\n${updateError}`);
        });

    } else {
        const singleUrlsUpdateSql = `UPDATE benign.crux_top_urls SET is_crawled = ?, is_accessible = ?, last_crawled_time = NOW() WHERE url_sha256 = ?`;
        const accessErrorUrlsSql = `INSERT IGNORE INTO benign.crux_top_urls_error (url, url_sha256, error_info) VALUES (?, ?, ?)`;
        logger.info(`${urlHashValue} | Start to dump crawledResult into table: benign.crux_top_urls .`)
        await singleUpdate(
            mysqlConn, singleUrlsUpdateSql, [
            true,
            false,
            urlHashValue
        ]
        ).then((changedRows) => {
            logger.info(`${urlHashValue} | Succeed to dump crawledResult into table: benign.crux_top_urls , changedRows: ${changedRows}.`)
        }).catch((updateError) => {
            logger.error(`Failed to dump crawledResult into table: benign.crux_top_urls .\n${updateError}`);
        });

        logger.info('${urlHashValue} | Start to dump access error record into table: crux_top_urls_error.')
        await singleInsert(
            mysqlConn, accessErrorUrlsSql, [url, urlHashValue, crawledResult.accessErrorInfo]
        ).then((insertId) => {
            logger.info(`${urlHashValue} | Succeed to dump access error record into table: crux_top_urls_error, insertId: ${insertId}.`)
        }).catch((insertError) => {
            logger.error(`${urlHashValue} | Failed to dump access error record into table: crux_top_urls_error.\n${insertError}`);
        });

    }
    logger.info(`${urlHashValue} | Start inserting crawledResult into mongodb.`);
    await mongodbColl.insertOne(crawledResult).catch(async (insertError) => {
        if (insertError.code === 11000) {
            logger.warn(`${urlHashValue} | The crawledResult already exists in mongodb.`);
            try {
                await mongodbColl.replaceOne({
                    _id: crawledResult._id
                }, crawledResult);
            } catch (replaceError) {
                logger.error(`${urlHashValue} | Failed to replace the crawledResult in mongodb.\n${replaceError}`);
            }
        } else {
            logger.error(`${urlHashValue} | Failed to insert crawledResult into mongodb.\n${insertError}`);
        }
    });
    logger.info(`${urlHashValue} | Succeed to insert crawledResult into mongodb!`);
}