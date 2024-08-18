import { Connection, Pool } from 'mysql'

export function singleInsert(mysqlConn: Connection | Pool, singleInsertSql: string, insertSqlParams: any[]): Promise<number> {
    return new Promise((resolve, reject) => {
        mysqlConn.query(singleInsertSql, insertSqlParams, function (err, result) {
            if (err) {
                reject(err);
            } else {
                // console.log(result);
                resolve(result.insertId);
            }
        });
    });
}

export function singleUpdate(mysqlConn: Connection | Pool, updateSql: string, updateSqlParams: any[]): Promise<number> {
    return new Promise((resolve, reject) => {
        mysqlConn.query(updateSql, updateSqlParams, function (err, result) {
            if (err) {
                reject(err);
            } else {
                // console.log(result);
                resolve(result.changedRows);
            }
        });
    });
}

export function batchInsert(mysqlConn: Connection | Pool, batchInsertSql: string, insertSqlParams: any[]): Promise<number> {
    return new Promise((resolve, reject) => {
        mysqlConn.query(batchInsertSql, [insertSqlParams], function (err, result) {
            if (err) {
                reject(err);
            } else {
                // console.log(result);
                resolve(result.affectedRows);
            }
        });
    });
}