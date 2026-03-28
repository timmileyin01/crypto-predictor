import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

async function test() {
  try {
    await transporter.verify()
    console.log('✅ Connection verified')

    await transporter.sendMail({
      from: `CryptoLSTM <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: 'CryptoLSTM Test Email',
      text: 'If you see this, the mailer is working!',
    })

    console.log('✅ Test email sent to', process.env.GMAIL_USER)
  } catch (err) {
    console.error('❌ Error:', err.message)
  }
}

test()