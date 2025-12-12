import boto3
import json
import os

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["IDEAS_TABLE"])

def get_item(user_id: str, idea_id: str):
    """
    Recupera un ítem por su clave primaria.
    No hace scan. No usa índices.
    Es O(1) y muy barato.
    """
    response = table.get_item(
        Key={
            "userId": user_id,
            "ideaId": idea_id
        }
    )
    return response.get("Item")


def lambda_handler(event, context):
    try:
        path = event.get("pathParameters") or {}
        user_id = path.get("userId")
        idea_id = path.get("ideaId")

        if not user_id or not idea_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "userId e ideaId son obligatorios"})
            }

        item = get_item(user_id, idea_id)

        if not item:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Idea no encontrada"})
            }

        return {
            "statusCode": 200,
            "body": json.dumps(item)
        }

    except Exception as e:
        print("❌ Error:", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
