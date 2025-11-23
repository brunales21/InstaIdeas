import boto3
import json
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
# Funciones auxiliares
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


def generar_json_idea(texto_transcrito):
    """
    Transforma la explicación de la idea en un JSON estructurado.
    Puede proponer soluciones si no están dichas, indicando que son propuestas.
    """
    prompt = f"""
El usuario ha enviado la siguiente explicación de una idea:

"{texto_transcrito}"

Tu tarea es:
- Interpretar la idea.
- Extraer información de forma clara.
- Completar los campos faltantes solo si es lógico, basándose en lo dicho.
- Si se inventa una parte (por ejemplo, la solución), indícalo con: "(propuesta generada)".
- Si una parte no puede inferirse, déjala como cadena vacía "".

Devuelve SOLO un JSON válido con esta estructura EXACTA:

{{
  "titulo": "",
  "descripcion": "",
  "problema": "",
  "solucion": "",
  "contexto_extra": ""
}}

Reglas:
- No añadas texto fuera del JSON.
- No expliques nada.
- No incluyas comentarios.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=350
    )

    contenido = response.choices[0].message.content

    print("📦 Respuesta bruta del modelo:")
    print(contenido)

    try:
        json_resultado = json.loads(contenido)
        print("📇 JSON generado correctamente:")
        print(json.dumps(json_resultado, indent=2))
        return json_resultado
    except Exception as e:
        print("⚠️ Error al parsear JSON:", e)
        return {"error": "JSON inválido", "raw": contenido}


def guardar_idea_dynamodb(user_id, audio_key, transcripcion, idea_json):
    """Guarda la información en DynamoDB."""
    timestamp = datetime.utcnow().isoformat()
    pk = f"user#{user_id}"
    sk = f"idea#{timestamp}"

    item = {
        "pk": pk,
        "sk": sk,
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

    # 2. Descargar audio desde S3
    audio_obj = s3.get_object(Bucket=bucket, Key=key)
    audio_bytes = audio_obj["Body"].read()

    print(f"🎧 Audio descargado: {len(audio_bytes)} bytes")

    # 3. Transcribir audio
    transcripcion = transcribe_audio(audio_bytes)

    # 4. Generar JSON estructurado
    idea_json = generar_json_idea(transcripcion)

    # 5. GUARDAR EN DYNAMODB (ID de usuario temporal)
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
