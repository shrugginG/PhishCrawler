import fs from 'fs';
const lockFilePath = '/home/shrugging/project/PhishDetect/PhishCrawler/phishy_crawler.lock';
import { Logger } from 'winston'

const checkLock = (logger: Logger): boolean => {
    if (fs.existsSync(lockFilePath)) {
        logger.info('Lock file exists. Exiting...');
        return true;
    } else {
        fs.writeFileSync(lockFilePath, process.pid.toString());
        logger.info('Lock file created.');
        return false;
    }
}

const releaseLock = (logger: Logger): void => {
    if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
        logger.info('Lock file released.');
    }
}

export { checkLock, releaseLock };