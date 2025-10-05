import axios  from "axios";
export async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to, // recipient phone number in international format, e.g., "919876543210"
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Message sent:', response.data);
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}


