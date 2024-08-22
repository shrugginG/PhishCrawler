import fs from 'fs';
const fs_promise = require('fs').promises;
// import {chromium} from 'playwright';
const { chromium, firefox, webkit } = require('playwright');
import { Logger } from 'winston'

import { strHashValue } from './misc'
import getChromeOptions from '../config/chrome_options'
import categorize from './wappalyzer'

// Define the result data structure.
interface Result {
    navigationChain: {
        main_frame: string[];
        child_frame: string[];
    };
    redirectionChain: string[][];
    consoleLogMessages: object[];
    [key: string]: any;
}

function singleUrlTimeout(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('Exceeded the time limit for accessing a single url!'));
        }, ms);
    });
}

export default async function crawlSingleUrl(url: string, userDataPath: string, archiveDir: string, logger: Logger) {

    // Initialize the result object.
    const result: Result = {
        redirectionChain: [],
        navigationChain: {
            main_frame: [],
            child_frame: []
        },
        consoleLogMessages: [],
    };

    // Initialize the result record object. 
    let resultRecord = {
        statusCode: false,
        ipAddress: false,
        port: false,
        title: false,
        content: false,
        screenshot: false,
        cookies: false,
        trace: false,
        wappalyzer: false,
        har: false,
    }

    // Store the error info of failed fields.
    const fieldsErrorInfo: { [key: string]: string } = {};

    // Specify the sha256 value of the url as the _id of the document.
    const urlHashValue = strHashValue(url, 'sha256');
    result._id = urlHashValue;
    result.url = url;

    // Create url data directory if not exists.
    const urlDataDir = archiveDir + urlHashValue + '/';
    if (!fs.existsSync(urlDataDir)) {
        fs.mkdirSync(urlDataDir);
    }
    const userDataDir = userDataPath + urlHashValue;

    // Launch persist browserContext.
    const persistContext = await chromium.launchPersistentContext(
        userDataDir,
        getChromeOptions(urlDataDir)
    );
    // persistContext.setDefaultTimeout(10000); // Default timeout: 30s.

    const currentPage = await persistContext.newPage();

    // Main 
    try {

        await Promise.race([
            (async () => {
                // Register page event listeners.

                // Get server address of the current page.
                // Remove the listener once it's activated.
                currentPage.once('request', async (firstRequest: any) => {

                    if (firstRequest.url() === url) {
                        try {
                            const firstResponse = await firstRequest.response();

                            // IP and port.
                            try {
                                const serverAddr = await firstResponse.serverAddr();
                                result.ipAddress = serverAddr.ipAddress;
                                result.port = serverAddr.port;
                                resultRecord.ipAddress = true;
                                resultRecord.port = true;
                            } catch (addressError) {
                                result.ipAddress = null;
                                result.port = null;
                                fieldsErrorInfo['address'] = `${addressError}`
                            }

                            // status code.
                            try {
                                const statusCode = await firstResponse.status();
                                result.statusCode = statusCode;
                                resultRecord.statusCode = true;
                            } catch (statusError) {
                                result.statusCode = null;
                                fieldsErrorInfo['status'] = `${statusError}`;
                            }

                        } catch (responseError) {
                            result.ip_address = null;
                            result.port = null;
                            result.status = null;
                            fieldsErrorInfo['response'] = `${responseError}`;
                        }
                    }
                })

                currentPage.on('framenavigated', async (frame: any) => {

                    // Check if current frame is main frame.
                    if (frame.parentFrame() === null) {
                        result.navigationChain['main_frame'].push(frame.url());
                    } else {
                        // TODO: Distinguish between child frames.
                        result.navigationChain['child_frame'].push(frame.url());
                    }

                });

                currentPage.on('requestfinished', async (request: any) => {

                    try {
                        const response = await request.response();

                        if (response.status() >= 300 && response.status() < 400) {
                            try {
                                result.redirectionChain.push([request.url(), response.headers()['location']]);
                            } catch (error) {
                                logger.error(`${urlHashValue} | Failed to get redirection chain for ${response.url} status code${response.status()}!`);
                            }
                        }
                    } catch (responseError) {
                        logger.error(`${urlHashValue} | Failed to get response for ${request.url()}!\n${responseError}`);
                    }
                });

                // Monitor the console log messages.
                currentPage.on('console', async (msg: any) => {
                    try {
                        const single_log_msg = {
                            type: msg.type(),
                            text: msg.text(),
                            location: msg.location()
                        }
                        result.consoleLogMessages.push(single_log_msg);
                    } catch (consoleError) {
                        logger.error(`${urlHashValue} | Failed to get console log message!\n${consoleError}`);
                    }
                })

                // Monitor the dialog.
                // currentPage.on('dialog', async (dialog: any) => {
                //     console.log(dialog.message());
                // })

                // Start tracing.
                await persistContext.tracing.start({
                    screenshots: true,
                    snapshots: true,
                    title: urlHashValue,
                    source: true
                });

                // Navigate to the target url.
                await currentPage.goto(url, {
                    // waitUntil: 'networkidle',
                    timeout: 180000,
                    waitUntil: 'domcontentloaded',
                });
                logger.info(`${urlHashValue} | Page go to ${url} !`);

                // Wait for webpage completely loaded.
                const singleWebpageDelay = 20000;
                await currentPage.waitForTimeout(singleWebpageDelay);
                logger.info(`${urlHashValue} | Page[${url}]] wait for ${singleWebpageDelay / 1000}s !`);

                const buttonSelector = 'button.cf-btn.cf-btn-danger[data-translate="dismiss_and_enter"]';

                // Bypass the cloudflare suspected phishing warning page 
                if (await currentPage.$(buttonSelector) !== null) {
                    logger.warn(`${urlHashValue} | Cloudflare suspected phishing warning appear!`);
                    await currentPage.click(buttonSelector);
                    logger.info(`${urlHashValue} | Clicked the Ignore & Proceed button!`);
                    await currentPage.waitForTimeout(singleWebpageDelay);
                    logger.info(`${urlHashValue} | Bypassed page[${url}] wait for ${singleWebpageDelay / 1000}s !`);
                }

                // Record page url (not equal to target url).
                result.page_url = currentPage.url();

                // Check if the page_url is legal.
                // TODO: url starts with 'blob:' can's be handled.
                if (!result.page_url.startsWith('http://') && !result.page_url.startsWith('https://')) {
                    throw new Error(`Illegal page url: ${result.page_url}`);
                }

                const [
                    title,
                    content,
                    screenshot,
                    cookies,
                ] = await Promise.all([
                    currentPage.title().catch((titleError: Error) => ({ titleError, type: 'titleError' })),
                    currentPage.content().catch((contentError: Error) => ({ contentError, type: 'contentError' })),
                    currentPage.screenshot({
                        path: urlDataDir + `${urlHashValue}.png`, fullPage: true
                    }).catch((screenshotError: Error) => ({ screenshotError, type: 'screenshotError' })),
                    persistContext.cookies().catch((cookiesError: Error) => ({ cookiesError, type: 'cookiesError' })),
                ])

                // Process the result or error of each field.

                if (!title.titleError) {
                    result.title = title;
                    resultRecord.title = true;
                } else {
                    result.title = null;
                    fieldsErrorInfo['title'] = `${title.titleError}`;
                }

                if (!content.contentError) {
                    fs.writeFileSync(urlDataDir + `${urlHashValue}.html`, content);
                    result.content = true;
                    resultRecord.content = true;
                } else {
                    result.content = false;
                    fieldsErrorInfo['content'] = `${content.contentError}`;
                }

                if (!screenshot.screenshotError) {
                    result.screenshot = true;
                    resultRecord.screenshot = true;
                } else {
                    result.screenshot = false;
                    fieldsErrorInfo['screenshot'] = `${screenshot.screenshotError}`;
                }

                if (!cookies.cookiesError) {
                    result.cookies = cookies;
                    resultRecord.cookies = true;
                } else {
                    result.cookies = null;
                    fieldsErrorInfo['cookies'] = `${cookies.cookiesError}`;
                }

                try {
                    await persistContext.tracing.stop({ path: urlDataDir + 'trace.zip' });
                    result.trace = true;
                    resultRecord.trace = true;
                } catch (traceError) {
                    result.trace = false;
                    fieldsErrorInfo['trace'] = `${traceError}`;
                }

                // Get wappalyzer results.
                try {

                    const hostname = await currentPage.evaluate(() => window.location.hostname);

                    let [backgroundPage] = persistContext.serviceWorkers();

                    const resolved = await backgroundPage.evaluate(`Wappalyzer.resolve(Driver.cache.hostnames['${hostname}'].detections)`);

                    const categorizedTechnologies = await categorize(resolved);
                    result.wappalyzer = categorizedTechnologies;
                    resultRecord.wappalyzer = true;
                } catch (wappalyzerError) {
                    result.wappalyzer = null;
                    fieldsErrorInfo['wappalyzer'] = `${wappalyzerError}`;
                }

                // Get crawled time.
                result.crawled_time = new Date();

                result.accessible = true;
            })(),
            singleUrlTimeout(300000) // Control the access time of a single url.
        ])

    } catch (accessError) {

        logger.error(`${urlHashValue} | Failed to access ${url} | ${urlHashValue} !\n${accessError} !`);

        result.accessible = false;
        result.accessErrorInfo = `${accessError}`
    } finally {

        // Closing only the context may stuck the process which will lead to rabbit message ack timeout!
        logger.info(`${urlHashValue} | Start closing current page and context: ${url} !`);
        await currentPage.close();
        logger.info(`${urlHashValue} | Current page: ${url} closed!`);
        try {
            await persistContext.close();
            logger.info(`${urlHashValue} | Persist context: ${url} closed!`);
        } catch (error: any) {
            if (error.message === 'Target page, context or browser has been closed') { // Many URLs will close along with the context when the page is closed, leading to TargetClosedError, e.g., https://www.bepal.net/.
                logger.error(`${urlHashValue} | Failed to close persist context: ${url} !\n${error}`);
            } else {
                logger.error(`${urlHashValue} | Unseen Error: ${url} !\n${error}`);
                throw error;
            }
        }
        await persistContext.close();

        result.har = true;
        resultRecord.har = true;
        result.completed = Object.values(resultRecord).every(value => value === true);
        result.fieldsErrorInfo = fieldsErrorInfo;

        logger.info(`${urlHashValue} | Start clearing all browser caches.`);
        await fs_promise.rm(userDataDir, { recursive: true, force: true }).catch(
            (clearError: Error) => {
                logger.error(`${urlHashValue} | Failed to clear browser caches [${url}].\n${clearError}`);
            }
        );
        logger.info(`${urlHashValue} | Succeed to clear all browser caches.`);

        logger.info(`${urlHashValue} | End access on ${url} !`);

        return [
            result,
            resultRecord,
        ]
    }
}

