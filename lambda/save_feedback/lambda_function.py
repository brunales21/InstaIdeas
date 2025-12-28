import json
import os
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["IDEAS_TABLE"])

def lambda_handler(event, context):
    body = json.loads(event.get("body") or "{}")

    user_id = body["userId"]
    idea_id = body["ideaId"]
    helped = body["helped"]  # true / false

    table.update_item(
        Key={
            "userId": user_id,
            "ideaId": idea_id
        },
        UpdateExpression="""
            SET feedback = :f,
                feedback_at = :t
        """,
        ExpressionAttributeValues={
            ":f": "like" if helped else "dislike",
            ":t": datetime.now(timezone.utc).isoformat()
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({"ok": True})
    }
