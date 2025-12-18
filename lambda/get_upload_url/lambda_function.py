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
    """Obtiene el nombre del bucket desde variables de entorno."""
    return os.environ["UPLOAD_BUCKET"]

def generate_timestamp():
    ts = datetime.now(timezone.utc).replace(tzinfo=None)
    return ts.isoformat().replace(":", "-").split(".")[0]


def build_audio_key(user_id: str, filename: str) -> str:
    """Construye la ruta final dentro del bucket."""
    ts = generate_timestamp()
    return f"audio/{user_id}/{ts}-{filename}"


def generate_presigned_upload_url(bucket: str, key: str, content_type: str) -> str:
    return s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=300
    )


def handle_request(event):
    body = json.loads(event.get("body") or "{}")

    filename = body.get("filename", "audio.webm")
    user_id = body.get("userId", "demo-user")
    content_type = body.get("contentType", "application/octet-stream")

    bucket = get_bucket_name()
    key = build_audio_key(user_id, filename)

    presigned_url = generate_presigned_upload_url(bucket, key, content_type)

    return {
        "statusCode": 200,
        "body": json.dumps({
            "upload_url": presigned_url,
            "audio_key": key
        })
    }


# ---------------------------
# Lambda Handler
# ---------------------------

def lambda_handler(event, context):
    """
    Punto de entrada de AWS Lambda.
    Mantiene solo la llamada al manejador real.
    """
    try:
        return handle_request(event)
    except Exception as e:
        print("❌ Error:", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

