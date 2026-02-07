import json
import os
import boto3
from datetime import datetime, timezone

s3 = boto3.client(
    "s3",
    config=boto3.session.Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"}
    )
)

# ---------------------------
# Helpers
# ---------------------------

def get_bucket_name():
    return os.environ["UPLOAD_BUCKET"]


def generate_timestamp():
    ts = datetime.now(timezone.utc).replace(tzinfo=None)
    return ts.isoformat().replace(":", "-").split(".")[0]


def build_audio_key(user_id: str, extension: str) -> str:
    ts = generate_timestamp()
    return f"audio/{user_id}/{ts}-idea.{extension}"


def generate_presigned_upload_url(bucket, key, content_type=None):
    params = {
        "Bucket": bucket,
        "Key": key
    }
    if content_type:
        params["ContentType"] = content_type
    return s3.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=300
    )


# ---------------------------
# Lambda Handler
# ---------------------------

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")

        user_id = body.get("userId", "demo-user")
        filename = body.get("filename") or "recording.webm"
        content_type = body.get("contentType")

        bucket = get_bucket_name()
        extension = filename.split(".")[-1] if "." in filename else "webm"
        key = build_audio_key(user_id, extension)

        upload_url = generate_presigned_upload_url(bucket, key, content_type)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "upload_url": upload_url,
                "audio_key": key
            })
        }

    except Exception as e:
        print("❌ Error:", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
