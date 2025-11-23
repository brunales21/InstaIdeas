import boto3
import json
import os
from datetime import datetime
from openai import OpenAI

# ---------------------------
# Inicialización de clientes
# ---------------------------
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("InstaIdeas")

client = OpenAI()


# ---------------------------
# Cargar prompt externo
# ---------------------------
def cargar_prompt():
    """
    Lee el archivo prompt.txt ubicado en el mismo directorio que este archivo.
    """
    ruta = os.path.join(os.path.dirname(__file__), "prompt.txt")
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------
# Transcripción
# ---------------------------
def transcribe_audio(audio_bytes):
    """Transcribe el audio usando gpt-4o-transcribe."""
    print("🧠 Enviando audio a gpt-4o-transcribe...")

    response = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=("audio.m4a", audio_bytes)
    )

    texto = response.text.strip()
    print("📝 Transcripción recibida:")
    print(texto)
    return texto


# ---------------------------
# Generar JSON estructurado
# ---------------------------
def generar_json_idea(texto_transcrito):
    """
    Transforma la explicación de la idea en un JSON estructurado usando prompt.txt.
    """

    # 1. cargar plantilla del prompt
    prompt_template = cargar_prompt()

    # 2. reemplazar placeholder
    prompt = prompt_template.replace("{texto_transcrito}", texto_transcrito)

    # 3. llamar al modelo
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=350
    )

    contenido = response.choices[0].message.content.strip()

    print("📦 Respuesta bruta del modelo:")
    print(contenido)

    # 4. intentar parsear JSON
    try:
        json_resultado = json.loads(contenido)
        print("📇 JSON generado correctamente:")
        print(json.dumps(json_resultado, indent=2))
        return json_resultado

    except Exception as e:
        print("⚠️ Error al parsear JSON:", e)
        return {"error": "JSON inválido", "raw": contenido}


# ---------------------------
# Guardar en DynamoDB
# ---------------------------
def guardar_idea_dynamodb(user_id, audio_key, transcripcion, idea_json):
    """Guarda la información en DynamoDB usando las claves userId e ideaId."""
    timestamp = datetime.utcnow().isoformat()

    item = {
        "userId": user_id,
        "ideaId": f"idea#{timestamp}",
        "audio_key": audio_key,
        "transcripcion": transcripcion,
        "idea_json": idea_json,
        "created_at": timestamp
    }

    print("💾 Guardando en DynamoDB:")
    print(json.dumps(item, indent=2))

    table.put_item(Item=item)

    return item


# ---------------------------
# Lambda Handler
# ---------------------------
def lambda_handler(event, context):
    print("🔔 Evento recibido desde S3:")
    print(json.dumps(event, indent=2))

    # 1. Extraer detalles del evento
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    print(f"📁 Audio subido: bucket={bucket}, key={key}")

    # 2. Descargar el audio desde S3
    audio_obj = s3.get_object(Bucket=bucket, Key=key)
    audio_bytes = audio_obj["Body"].read()

    print(f"🎧 Audio descargado: {len(audio_bytes)} bytes")

    # 3. Transcribir audio
    transcripcion = transcribe_audio(audio_bytes)

    # 4. Generar JSON estructurado
    idea_json = generar_json_idea(transcripcion)

    # 5. Guardar en DynamoDB (usuario temporal)
    saved_item = guardar_idea_dynamodb(
        user_id="demo-user",
        audio_key=key,
        transcripcion=transcripcion,
        idea_json=idea_json
    )

    # 6. Respuesta final
    return {
        "statusCode": 200,
        "body": json.dumps({
            "mensaje": "Procesado correctamente",
            "idea_guardada": saved_item
        })
    }
