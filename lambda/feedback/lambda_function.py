import json
import os
import boto3
from datetime import datetime, timezone

MAX_CHARS = 280

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["IDEAS_TABLE"])

def lambda_handler(event, context):
    print("EVENT >>>", event)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON"})
        }

    user_id = body.get("userId")
    idea_id = body.get("ideaId")
    helped = body.get("helped")
    comment = (body.get("comment") or "").strip()

    if user_id is None or idea_id is None or helped is None:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing required fields"})
        }

    if not isinstance(helped, bool):
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "helped must be boolean"})
        }

    if len(comment) > MAX_CHARS:
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": f"Comment too long (max {MAX_CHARS} characters)"
            })
        }

    feedback = {
        "helped": helped,
        "comment": comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    table.update_item(
        Key={
            "userId": user_id,
            "ideaId": idea_id
        },
        UpdateExpression="SET feedback = :feedback",
        ExpressionAttributeValues={
            ":feedback": feedback
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Feedback saved"})
    }
