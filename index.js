const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const multer = require('multer');
const app = express();
const port = 5000;
const fs = require('fs-extra'); // Import fs-extra for easier file operations
const path = require('path');

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage });

// Paths for the auth and cache directories
const authDir = path.resolve(__dirname, '.wwebjs_auth');
const cacheDir = path.resolve(__dirname, '.wwebjs_cache');

// Initialize the WhatsApp client with LocalAuth to maintain the session
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Run the browser in headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    }
});

// Generate and display the QR code in the console
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Please scan the QR code to connect to WhatsApp');
});

// Log when authenticated
client.on('authenticated', () => {
    console.log('Authenticated successfully!');
});

// Log when the client is ready
client.on('ready', () => {
    console.log('WhatsApp client is ready');
});

// Handle client disconnections and attempt reconnection
client.on('disconnected', async (reason) => {
    console.log('Client was disconnected:', reason);

    // Attempt to delete the auth and cache directories
    try {
        await fs.remove(authDir);
        await fs.remove(cacheDir);
        console.log('Auth and cache directories removed successfully.');
    } catch (error) {
        console.error('Failed to remove auth or cache directories:', error);
    }

    // Re-initialize the client on disconnection
    client.initialize();
});


// API endpoint to send messages or PDFs
app.post('/send', upload.single('pdf'), async (req, res) => {
    const number = req.query.number; // Get the number from the request body
    const message = req.query.message; // Get the message from the request body

    if (!number) {
        return res.status(400).send({ status: 'error', message: 'Please provide a number' });
    }

    // Format the number in international format (e.g., 91XXXXXXXXXX for India)
    const chatId = `${number}@c.us`; // Use '@c.us' for personal chats

    try {
        if (req.file) {
            // If a PDF file is provided, send the PDF
            const media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
            await client.sendMessage(chatId, media, { caption: 'Here is your PDF!' });
            res.status(200).send({ status: 'success', message: 'PDF sent successfully' });
        } else if (message) {
            // If a message is provided, send the text message
            await client.sendMessage(chatId, message);
            res.status(200).send({ status: 'success', message: 'Message sent successfully' });
        } else {
            return res.status(400).send({ status: 'error', message: 'Please provide either a message or a PDF file' });
        }
    } catch (error) {
        console.error('Failed to send:', error);
        res.status(500).send({ status: 'error', message: 'Failed to send', error });
    }
});

async function safeLogout(client) {
    let retries = 3;
    while (retries > 0) {
        try {
            await client.logout();
            console.log('Logged out successfully.');
            return;
        } catch (error) {
            if (error.code === 'EBUSY') {
                console.log('Resource busy, retrying logout...');
                retries--;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            } else {
                throw error; // Re-throw other errors
            }
        }
    }
    console.error('Failed to log out after multiple attempts.');
}

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await safeLogout(client);
    process.exit(0);
});

// Start the WhatsApp client
client.initialize();

// Start the Express server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
