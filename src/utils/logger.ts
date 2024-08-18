import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const phishyLogger = createLogger({
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(info => `${info.timestamp} | ${info.level} | ${info.message}`)
    ),
    transports: [

        new DailyRotateFile({
            dirname: '/home/shrugging/project/PhishDetect/PhishCrawler/logs/phishy/',
            filename: `%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(
                    info => `${info.timestamp} | ${info.level} | ${info.message}`
                )
            )
        })
    ].flat()
});

const benignLogger = createLogger({
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(info => `${info.timestamp} | ${info.level} | ${info.message}`)
    ),
    transports: [
        new DailyRotateFile({
            dirname: '/home/shrugging/project/PhishDetect/PhishCrawler/logs/benign/crux_top_urls/',
            filename: `%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(
                    info => `${info.timestamp} | ${info.level} | ${info.message}`
                )
            )
        })
    ].flat()
});

export { phishyLogger, benignLogger };