import json
import os
import boto3
import base64
from datetime import datetime, timezone
from openai import OpenAI

# ---------------------------
# Inicialización de clientes
# ---------------------------
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["IDEAS_TABLE"])

client = OpenAI()

# ---------------------------
# Helpers generales
# ---------------------------

def get_env_bucket():
    return os.environ["UPLOAD_BUCKET"]


def generate_idea_id():
    """Genera un ID único usando UTC timezone-aware."""
    now = datetime.now(timezone.utc)
    return f"idea#{now.isoformat()}"


def parse_event_body(event) -> dict:
    """
    Maneja body normal y body base64 (API Gateway v2).
    """
    body = event.get("body")
    if not body:
        return {}

    if event.get("isBase64Encoded"):
        decoded = base64.b64decode(body).decode("utf-8")
        return json.loads(decoded)

    return json.loads(body)


# ---------------------------
# Lógica de negocio
# ---------------------------

def download_audio_from_s3(bucket: str, key: str) -> bytes:
    """Descarga el audio desde S3 y devuelve los bytes."""
    audio_obj = s3.get_object(Bucket=bucket, Key=key)
    return audio_obj["Body"].read()


def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe audio usando OpenAI gpt-4o-transcribe."""
    response = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=("audio.m4a", audio_bytes)
    )
    return response.text.strip()


def load_prompt_template() -> str:
    """Carga el contenido de prompt.txt."""
    path = os.path.join(os.path.dirname(__file__), "prompt.txt")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def generate_structured_json(transcript: str) -> dict:
    """
    Genera un JSON estructurado usando prompt.txt.
    """
    prompt_template = load_prompt_template()
    prompt = prompt_template.replace("{texto_transcrito}", transcript)

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=350
    )

    raw = completion.choices[0].message.content.strip()

    try:
        return json.loads(raw)
    except Exception:
        return {"error": "JSON inválido", "raw": raw}


def save_idea_to_dynamodb(
    user_id: str,
    audio_key: str,
    transcript: str,
    idea_json: dict
) -> dict:
    """
    Guarda la idea en DynamoDB.
    """
    now = datetime.now(timezone.utc)

    item = {
        "userId": user_id,
        "ideaId": f"idea#{now.isoformat()}",
        "audio_key": audio_key,
        "transcripcion": transcript,
        "idea_json": idea_json,
        "created_at": now.isoformat()
    }

    table.put_item(Item=item)
    return item


# ---------------------------
# Lambda Handler
# ---------------------------

def lambda_handler(event, context):
    print("EVENT >>>", json.dumps(event))

    try:
        body = parse_event_body(event)

        audio_key = body.get("audio_key")
        user_id = body.get("userId", "demo-user")

        if not audio_key:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "audio_key es obligatorio"})
            }

        bucket = get_env_bucket()

        # 1. Descargar audio
        audio_bytes = download_audio_from_s3(bucket, audio_key)

        # 2. Transcribir
        transcript = transcribe_audio(audio_bytes)

        # 3. Generar JSON estructurado
        idea_json = generate_structured_json(transcript)

        # 4. Guardar en DynamoDB
        saved_item = save_idea_to_dynamodb(
            user_id=user_id,
            audio_key=audio_key,
            transcript=transcript,
            idea_json=idea_json
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "mensaje": "Idea procesada correctamente",
                "idea": saved_item
            })
        }

    except Exception as e:
        print("❌ Error:", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
