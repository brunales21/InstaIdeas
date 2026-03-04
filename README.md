🚀 InstaIdeas

Capture ideas before they disappear.

InstaIdeas is a serverless web app that transforms short voice notes into structured ideas using AI.
Users record audio, the system processes it, stores the structured output, and optionally sends it by email.

🏗 Architecture

Frontend

Static site (HTML, CSS, JS)

Hosted on S3

Distributed via CloudFront

Custom domain

Backend (AWS Lambda)

get_upload_url → Pre-signed S3 upload

process_audio → Transcription + AI structuring

get_idea → Fetch idea from DynamoDB

send_idea_email → Email via Amazon SES

feedback → Store user feedback

AWS Services
Lambda · S3 · DynamoDB · SES · API Gateway · CloudFront · IAM

🔁 Flow

User records audio

Audio uploaded to S3

Lambda processes and structures idea

Idea stored in DynamoDB

User can view or email result

⚙ CI/CD

GitHub Actions deploys only modified Lambdas automatically on push to main.

🧠 Focus

Voice-first capture

Serverless architecture

Lean MVP iteration

Transactional email only (SES)
