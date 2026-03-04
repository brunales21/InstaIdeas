# 🚀 InstaIdeas

**Capture ideas before they disappear.**

InstaIdeas is a serverless web application that transforms short voice notes into structured ideas using AI.

Record a few seconds of audio.  
We process it, structure it, store it, and optionally send it to your email.

---

## 🏗 Architecture

### Frontend
- Static site (HTML, CSS, JS)
- Hosted on Amazon S3
- Distributed via CloudFront
- Custom domain

### Backend (AWS Lambda)
- `get_upload_url` → Generate pre-signed S3 upload URL
- `process_audio` → Transcription + AI structuring
- `get_idea` → Retrieve idea from DynamoDB
- `send_idea_email` → Send idea via Amazon SES
- `feedback` → Store user feedback

---

## 🔁 Flow

1. User records audio  
2. Audio is uploaded to S3  
3. The system processes and structures the idea  
4. Structured output is stored in DynamoDB  
5. User can view or receive the result by email  

---

## ⚙ CI/CD

GitHub Actions automatically deploys updated Lambda functions on push to `main`.

---

## 🧠 Focus

- Voice-first idea capture  
- Serverless architecture  
- Lean MVP iteration  
- Transactional email delivery  

---

Built as an experiment in fast product validation using AWS serverless infrastructure.
