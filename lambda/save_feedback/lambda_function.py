import json
import os
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["IDEAS_TABLE"])

def lambda_handler(event, context):
    print("EVENT >>>", event)

    body = json.loads(event.get("body") or "{}")

    user_id = body.get("userId")
    idea_id = body.get("ideaId")
    helped = body.get("helped")

    if user_id is None or idea_id is None or helped is None:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing required fields"})
        }

    # 🔥 UPDATE, no PUT (la idea ya existe)
    table.update_item(
        Key={
            "userId": user_id,
            "ideaId": idea_id
        },
        UpdateExpression="""
            SET
              feedback_helped = :helped,
              feedback_at = :ts
        """,
        ExpressionAttributeValues={
            ":helped": helped,
            ":ts": datetime.now(timezone.utc).isoformat()
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Feedback saved"})
    }
