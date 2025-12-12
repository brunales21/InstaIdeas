import json
import os
import boto3
from datetime import datetime
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
    """Genera un ID único basado en timestamp."""
    return f"idea#{datetime.utcnow().isoformat()}"


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


def generate_structured_json(transcript: str) -> dict:
    """
    Genera un JSON estructurado usando prompt.txt.
    El modelo debe devolver únicamente JSON válido.
    """
    prompt_template = load_prompt_template()
    prompt = prompt_template.replace("{texto_transcrito}", transcript)

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=350
    )

    raw = completion.choices[0].message.content.strip()

    # Intentar parsear como JSON
    try:
        return json.loads(raw)
    except Exception:
        return {"error": "JSON inválido", "raw": raw}


def load_prompt_template() -> str:
    """Carga el contenido de prompt.txt ubicado en el mismo directorio."""
    path = os.path.join(os.path.dirname(__file__), "prompt.txt")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def save_idea_to_dynamodb(user_id: str, audio_key: str, transcript: str, idea_json: dict) -> dict:
    """
    Guarda todo en DynamoDB con claves userId + ideaId.
    """
    idea_id = generate_idea_id()
    timestamp = datetime.utcnow().isoformat()

    item = {
        "userId": user_id,
        "ideaId": idea_id,
        "audio_key": audio_key,
        "transcripcion": transcript,
        "idea_json": idea_json,
        "created_at": timestamp
    }

    table.put_item(Item=item)
    return item


# ---------------------------
# Lambda Handler
# ---------------------------

def lambda_handler(event, context):
    """Punto de entrada principal, muy limpio."""
    try:
        body = json.loads(event.get("body") or "{}")

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

        # 5. Responder
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
