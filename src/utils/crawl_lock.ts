import fs from "fs";
import { Logger } from "winston";

const checkLock = (logger: Logger, isBenign: boolean): boolean => {
    const lockFilePath = `/home/jxlu/project/PhishDetect/PhishCrawler/${isBenign ? "benign" : "phishy"}_crawler.lock`;
    if (fs.existsSync(lockFilePath)) {
        logger.info("Lock file exists. Exiting...");
        return true;
    } else {
        fs.writeFileSync(lockFilePath, process.pid.toString());
        logger.info("Lock file created.");
        return false;
    }
};

const releaseLock = (logger: Logger, isBenign: boolean): void => {
    const lockFilePath = `/home/jxlu/project/PhishDetect/PhishCrawler/${isBenign ? "benign" : "phishy"}_crawler.lock`;
    if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
        logger.info("Lock file released.");
    }
};

export { checkLock, releaseLock };
