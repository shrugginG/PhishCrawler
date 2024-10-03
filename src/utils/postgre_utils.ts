import { Pool, QueryResult } from "pg";

// singleInsert: Insert a single row into the database
export function singleInsert(
    pgPool: Pool,
    singleInsertSql: string,
    insertSqlParams: any[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        pgPool.query(
            singleInsertSql,
            insertSqlParams,
            (err, result: QueryResult) => {
                if (err) {
                    reject(err);
                } else {
                    // Resolve with the number of rows inserted
                    // resolve(result.rowCount); // Use RETURNING clause in SQL to get the actual inserted ID if needed
                    resolve(result.rowCount ?? 0);
                }
            },
        );
    });
}

// singleUpdate: Update a single row in the database
export function singleUpdate(
    pgPool: Pool,
    updateSql: string,
    updateSqlParams: any[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        pgPool.query(updateSql, updateSqlParams, (err, result: QueryResult) => {
            if (err) {
                reject(err);
            } else {
                // Resolve with the number of rows affected
                // resolve(result.rowCount);
                resolve(result.rowCount ?? 0);
            }
        });
    });
}

// batchInsert: Insert multiple rows into the database
export function batchInsert(
    pgPool: Pool,
    batchInsertSql: string,
    insertSqlParams: any[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        pgPool.query(
            batchInsertSql,
            insertSqlParams,
            (err, result: QueryResult) => {
                if (err) {
                    reject(err);
                } else {
                    // Resolve with the number of rows inserted
                    // resolve(result.rowCount);
                    resolve(result.rowCount ?? 0);
                }
            },
        );
    });
}
