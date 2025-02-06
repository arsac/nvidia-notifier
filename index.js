import 'dotenv/config';
import {Client, GatewayIntentBits} from 'discord.js';
import Pushover from 'node-pushover';

const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]});
if (process.env.DISCORD_TOKEN) {
    await client.login(process.env.DISCORD_TOKEN);
}

const pushOver = process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER_KEY ? new Pushover({
    token: process.env.PUSHOVER_TOKEN,
    user: process.env.PUSHOVER_USER_KEY
}) : null;

const interval = Math.max(1, Number(process.env.INTERVAL) || 60) * 1000
const locale = process.env.LOCALE || 'de-de';
const localeFEInventory = process.env.LOCALE_FEINVENTORY || 'DE';


const gpus = {
    'RTX_5090': {
        enabled: process.env.RTX_5090 && process.env.RTX_5090 !== 'false',
        gpuParam: 'RTX 5090'
    },
    'RTX_5080': {
        enabled: process.env.RTX_5080 && process.env.RTX_5080 !== 'false',
        gpuParam: 'RTX 5080'
    }
}


const selectedGPUs = Object.keys(gpus).filter(key => gpus?.[key]?.enabled).map(key => encodeURI(gpus?.[key]?.gpuParam)).join();

if (selectedGPUs.length === 0) {
    console.log('No GPUs selected. Enable at least one GPU in your .env file.');
    process.exit();
}

const url = `https://api.nvidia.partners/edge/product/search?page=1&limit=9&locale=${locale}&category=GPU&gpu=${selectedGPUs}&manufacturer=NVIDIA`;
const urlsFEInventory = [
    `https://api.store.nvidia.com/partner/v1/feinventory?skus=NVGFT590&locale=${localeFEInventory}`,
    `https://api.store.nvidia.com/partner/v1/feinventory?skus=NVGFT580&locale=${localeFEInventory}`
];
const options = {
    headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    }
};

/**
 * Available types:
 *
 * 29: "Check Availability"
 * 76: "Buy Now"
 * 75: "Buy Now"
 * 77: "Customized & Buy"
 * 80: "Out Of Stock"
 */
let currentTypes = {};

/**
 * NVGFT590 = NVIDIA GEFORCE RTX 5090
 * NVGFT580 = NVIDIA GEFORCE RTX 5080
 */
let currentFEInventory = {};

// Send startup notification


async function fetchProducts(sendNotification) {
    const date = new Date();
    if (process.env.DAYS) {
        const days = process.env.DAYS.split(',').map(x => parseInt(x));
        if (!days.includes(date.getDay())) {
            return;
        }
    }
    if (process.env.HOURS) {
        const hours = process.env.HOURS.split('-').map(x => parseInt(x));
        const hour = date.getHours();
        if (hours.length === 2 && (hour < hours[0] || hour >= hours[1])) {
            return;
        }
    }

    const time = date.toISOString();

    if (gpus['RTX_5090'].enabled) {
        const listMap = await fetchFEInventory(urlsFEInventory[0]);
        if (listMap) {
            const wasActiveNVGFT590 = currentFEInventory[`NVGFT590_${localeFEInventory}`];
            let isActiveNVGFT590 = false;
            for (const product of listMap) {
                const is_active = product['is_active'] === 'true';
                const product_url = product['product_url'];
                const productTitle = 'NVIDIA GEFORCE RTX 5090';
                if (is_active) {
                    isActiveNVGFT590 = true;
                    console.log(`${time}: [${productTitle}] [FEInventory] - Available at ${product_url}`);
                    if (!wasActiveNVGFT590 && sendNotification) {
                        await notify(productTitle, product_url);
                    }
                } else {
                    console.log(`${time}: [${productTitle}] [FEInventory] - Out of stock`);
                }
            }
            currentFEInventory[`NVGFT590_${localeFEInventory}`] = isActiveNVGFT590;
        }
    }

    if (gpus['RTX_5080'].enabled) {
        const listMap = await fetchFEInventory(urlsFEInventory[1]);
        if (listMap) {
            const wasActiveNVGFT580 = currentFEInventory[`NVGFT580_${localeFEInventory}`];
            let isActiveNVGFT580 = false;
            for (const product of listMap) {
                const is_active = product['is_active'] === 'true';
                const product_url = product['product_url'];
                const productTitle = 'NVIDIA GEFORCE RTX 5080';
                if (is_active) {
                    isActiveNVGFT580 = true;
                    console.log(`${time}: [${productTitle}] [FEInventory] - Available at ${product_url}`);
                    if (!wasActiveNVGFT580 && sendNotification) {
                        await notify(productTitle, product_url);
                    }
                } else {
                    console.log(`${time}: [${productTitle}] [FEInventory] - Out of stock`);
                }
            }
            currentFEInventory[`NVGFT580_${localeFEInventory}`] = isActiveNVGFT580;
        }
    }

    const products = await fetchProductDetails();
    if (products) {
        for (const productDetails of products) {
            const productTitle = productDetails['productTitle'];
            //const productPrice = productDetails['productPrice'];
            const gpu = productDetails['gpu'];
            const prdStatus = productDetails['prdStatus'];
            if (prdStatus !== "out_of_stock") {
                console.log(`${time}: [${productTitle}] - prdStatus not "out_of_stock": ${prdStatus}`);
            }
            const retailers = productDetails['retailers'];
            const retailerNames = [];
            for (const retailer of retailers) {
                //const isAvailable = retailer['isAvailable'];
                const purchaseLink = retailer['purchaseLink'];
                //const partnerId = retailer['partnerId'];
                //const storeId = retailer['storeId'];
                const retailerName = retailer['retailerName'];
                const type = retailer['type'];
                retailerNames.push(retailerName);
                if (type !== 80) {
                    console.log(`${time}: [${productTitle}] [${retailerName}] - Available at ${purchaseLink}`);
                    const wasAvailable = retailerName in currentTypes[gpu] && currentTypes[gpu][retailerName] !== 80;
                    if (!wasAvailable && sendNotification) {
                        notify(productTitle, purchaseLink);
                    }
                } else {
                    console.log(`${time}: [${productTitle}] [${retailerName}] - Out of stock`);
                }
                if (!currentTypes[gpu]) {
                    currentTypes[gpu] = {};
                }
                currentTypes[gpu][retailerName] = type;
            }
            for (const retailerName in currentTypes[gpu]) {
                if (!retailerNames.includes(retailerName)) {
                    delete currentTypes[gpu][retailerName];
                }
            }
        }
    }
}


function scheduleFetch() {
    const randomInterval = interval + Math.floor(Math.random() * interval);

    console.log(`Next check in ${randomInterval / 1000} seconds...`);

    setTimeout(() => {
        fetchProducts(true).then(scheduleFetch)
    }, randomInterval);
}

// Fetch once to get current availability
fetchProducts(false).then(scheduleFetch)

async function notify(productTitle, purchaseLink) {
    return Promise.all(
        [sendProductDiscordMessage(productTitle, purchaseLink), sendProductPushover(productTitle, purchaseLink)]
    );
}

async function sendProductPushover(productTitle, purchaseLink) {
    await sendPushover(productTitle, `${productTitle} - Available at ${purchaseLink}`);
}

async function sendPushover(title, message) {
    return new Promise((resolve => {
            if (!pushOver) {
                resolve();
                return;
            }

            try {
                pushOver.send(title, message, function (err, res) {
                    if (err) return console.log(err);
                    resolve(res);
                });

            } catch (error) {
                console.log(error);
                resolve();
            }
        })
    );
}

async function sendProductDiscordMessage(productTitle, purchaseLink) {
    return sendDiscordMessage(productTitle, `${productTitle} - Available at ${purchaseLink}`);
}

async function sendDiscordMessage(title, message) {
    // Channel notification
    if (process.env.DISCORD_CHANNEL_ID) {
        if (process.env.DISCORD_ROLE_ID) {
            message = `<@&${process.env.DISCORD_ROLE_ID}> ` + message;
        }
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID)
        await channel.send(message);
    }

    // User notification
    if (process.env.DISCORD_USER_IDS) {
        const userIds = process.env.DISCORD_USER_IDS.split(';');
        for (const userId of userIds) {
            const user = await client.users.fetch(userId);
            await user.send(message);
        }
    }
}


async function fetchFEInventory(url) {
    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url, options);
        const json = await response.json();
        return json['listMap'];
    } catch (error) {
        console.log(error);
        return null;
    }
}

async function fetchProductDetails() {
    try {
        const response = await fetch(url, options);
        const json = await response.json();
        const searchedProducts = json['searchedProducts'];
        const featuredProduct = searchedProducts['featuredProduct'];
        const productDetails = searchedProducts['productDetails'];
        const products = [];
        if (featuredProduct) {
            products.push(featuredProduct);
        }
        for (const product of productDetails) {
            products.push(product);
        }
        return products;
    } catch (error) {
        console.log(error);
        return null;
    }
}
