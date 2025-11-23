import boto3
import json
import os
from openai import OpenAI

# Inicializar clientes AWS
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("InstaIdeas")

# Inicializar cliente de OpenAI usando variable de entorno
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def transcribe_audio(audio_bytes):
    """
    Envía el audio a gpt-4o-transcribe para obtener texto
    """
    print("🧠 Enviando audio a gpt-4o-transcribe...")

    response = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=("audio.m4a", audio_bytes)
    )

    print("📝 Transcripción recibida:")
    print(response.text)

    return response.text


def lambda_handler(event, context):
    print("🔔 Evento recibido desde S3:")
    print(json.dumps(event, indent=2))

    # 1. Leer información del archivo en el evento
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    print(f"📁 Audio subido: bucket={bucket}, key={key}")

    # 2. Descargar el archivo desde S3
    audio_obj = s3.get_object(Bucket=bucket, Key=key)
    audio_bytes = audio_obj["Body"].read()

    print(f"🎧 Audio descargado: {len(audio_bytes)} bytes")

    # 3. Transcripción del audio
    transcripcion = transcribe_audio(audio_bytes)

    print("🧾 Texto final transcrito:")
    print(transcripcion)

    # 4. Respuesta temporal (antes de guardar en DynamoDB)
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Transcripción completada",
            "bucket": bucket,
            "key": key,
            "transcripcion": transcripcion[:200]  # primeros 200 caracteres
        })
    }
