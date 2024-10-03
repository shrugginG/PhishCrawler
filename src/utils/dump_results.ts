import { Collection } from "mongodb";
import { Pool } from "pg";
import { Logger } from "winston";
import { strHashValue } from "./misc";
import { singleInsert, singleUpdate } from "./postgre_utils";

export default async function dumpCrawledResults(
    isBenign: boolean,
    url: string,
    crawledResult: any,
    pgPool: Pool,
    mongodbColl: Collection,
    logger: Logger,
) {
    const urlHashValue = strHashValue(url, "sha256");

    const url_table = `${isBenign ? "crux_top_urls" : "phishy_urls"}`;
    const error_table = `${isBenign ? "crux_top_urls" : "phishy_urls"}_error`;

    if (crawledResult.accessible) {
        // Define the sql statements.
        const singleUrlsUpdateSql = `UPDATE ${url_table} SET is_crawled = $1, page_url = $2, is_accessible = $3, status_code = $4, ip = $5, port = $6, title = $7, is_completed = $8, last_crawled_time = NOW() WHERE url_sha256 = $9`;
        // Try dump crawledResult to mysql.
        logger.info(
            `${urlHashValue} | Start to dump crawledResult into table: ${url_table} .`,
        );
        await singleUpdate(pgPool, singleUrlsUpdateSql, [
            true,
            typeof crawledResult.page_url === "string"
                ? crawledResult.page_url.substring(0, 2048)
                : null,
            crawledResult.accessible,
            crawledResult.statusCode,
            crawledResult.ipAddress,
            crawledResult.port,
            typeof crawledResult.title === "string"
                ? crawledResult.title.substring(0, 255)
                : null,
            crawledResult.completed,
            urlHashValue,
        ])
            .then((changedRows) => {
                logger.info(
                    `${urlHashValue} | Succeed to dump crawledResult into table: ${url_table} , changedRows: ${changedRows}.`,
                );
            })
            .catch((updateError) => {
                logger.error(
                    `${urlHashValue} | Failed to dump crawledResult into table: ${url_table} .\n${updateError}`,
                );
            });
    } else {
        const singleUrlsUpdateSql = `UPDATE ${url_table} SET is_crawled = $1, is_accessible = $2, last_crawled_time = NOW() WHERE url_sha256 = $3`;
        const accessErrorUrlsSql = `INSERT INTO ${error_table} (url, url_sha256, error_info) VALUES ($1, $2, $3) ON CONFLICT (url_sha256) DO NOTHING`;
        logger.info(
            `${urlHashValue} | Start to dump crawledResult into table: ${url_table} .`,
        );
        await singleUpdate(pgPool, singleUrlsUpdateSql, [
            true,
            false,
            urlHashValue,
        ])
            .then((changedRows) => {
                logger.info(
                    `${urlHashValue} | Succeed to dump crawledResult into table: ${url_table} , changedRows: ${changedRows}.`,
                );
            })
            .catch((updateError) => {
                logger.error(
                    `${urlHashValue} | Failed to dump crawledResult into table: ${url_table} .\n${updateError}`,
                );
            });

        logger.info(
            `${urlHashValue} | Start to dump access error record into table: crux_top_urls_error.`,
        );
        await singleInsert(pgPool, accessErrorUrlsSql, [
            url,
            urlHashValue,
            crawledResult.accessErrorInfo,
        ])
            .then((insertId) => {
                logger.info(
                    `${urlHashValue} | Succeed to dump access error record into table: ${error_table}, insertId: ${insertId}.`,
                );
            })
            .catch((insertError) => {
                logger.error(
                    `${urlHashValue} | Failed to dump access error record into table: ${error_table}.\n${insertError}`,
                );
            });
    }
    logger.info(
        `${urlHashValue} | Start inserting crawledResult into mongodb.`,
    );
    await mongodbColl.insertOne(crawledResult).catch(async (insertError) => {
        if (insertError.code === 11000) {
            logger.warn(
                `${urlHashValue} | The crawledResult already exists in mongodb.`,
            );
            try {
                await mongodbColl.replaceOne(
                    {
                        _id: crawledResult._id,
                    },
                    crawledResult,
                );
                logger.info(
                    `${urlHashValue} | Succeed to replace the crawledResult in mongodb.`,
                );
            } catch (replaceError) {
                logger.error(
                    `${urlHashValue} | Failed to replace the crawledResult in mongodb.\n${replaceError}`,
                );
            }
        } else {
            logger.error(
                `${urlHashValue} | Failed to insert crawledResult into mongodb.\n${insertError}`,
            );
        }
    });
    logger.info(
        `${urlHashValue} | Succeed to insert crawledResult into mongodb!`,
    );
}

