from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime
import pytz
import os
from supabase import create_client, Client

# -------------------------------------------------------------
# 1. INICIALIZAÇÃO DA API FASTAPI
# -------------------------------------------------------------
app = FastAPI(
    title="API Controle Hibrido v2",
    description="Backend conectado ao Supabase com tratamento seguro de erros",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEZONE_BR = pytz.timezone("America/Sao_Paulo")

# -------------------------------------------------------------
# 2. CREDENCIAIS E CONEXÃO COM O SUPABASE
# -------------------------------------------------------------
SUPABASE_URL = "https://awcfurzssrtvjuwqfebp.supabase.co"
SUPABASE_KEY = "sb_publishable_hFUNm34QcB80l3SgQ_jfKQ_hyPjAKMY"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Conectado ao Supabase com sucesso!")
except Exception as e:
    supabase = None
    print(f"❌ Erro de conexão com Supabase: {e}")

if not os.path.exists("static"):
    os.makedirs("static")

# -------------------------------------------------------------
# 3. ROTAS DA API (ENDPOINTS)
# -------------------------------------------------------------
@app.get("/")
def carregar_frontend():
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "online"}

@app.get("/api/registros")
def listar_registros():
    if not supabase:
        raise HTTPException(status_code=500, detail="Servidor não conectado ao Supabase.")
    try:
        res = supabase.table("registros").select("*").order("data", desc=True).order("hora", desc=True).execute()
        return res.data
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados: {str(err)}")

@app.post("/api/registrar")
async def registrar_ponto(
    tipo: str = Form(...),
    empresa: str = Form(default="Vivo"),
    observacao: str = Form(default=""),
    data_manual: str = Form(default=""),
    foto: UploadFile = File(None)
):
    """
    Recebe os dados do formulário com tratamento seguro de upload de foto e gravação de ponto.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Servidor não conectado ao Supabase.")

    try:
        agora_br = datetime.now(TIMEZONE_BR)
        
        # Define a data oficial do registro
        data_final = data_manual.strip() if data_manual.strip() else agora_br.strftime("%Y-%m-%d")
        hora_final = agora_br.strftime("%H:%M:%S")

        url_foto_publica = None

        # 1. Tenta fazer o upload da foto para o Storage do Supabase de forma segura
        if foto and foto.filename:
            try:
                extensao = os.path.splitext(foto.filename)[1].lower()
                if not extensao:
                    extensao = ".jpg"
                
                nome_arquivo_storage = f"foto_{agora_br.strftime('%Y%m%d_%H%M%S')}{extensao}"
                conteudo_foto = await foto.read()

                # Upload para o bucket 'comprovantes'
                supabase.storage.from_("comprovantes").upload(
                    path=nome_arquivo_storage,
                    file=conteudo_foto,
                    file_options={"content-type": foto.content_type or "image/jpeg"}
                )

                url_foto_publica = supabase.storage.from_("comprovantes").get_public_url(nome_arquivo_storage)
                print(f"📸 Foto salva no Storage: {url_foto_publica}")
            except Exception as foto_err:
                print(f"⚠️ Aviso: Não foi possível salvar a foto no Storage: {foto_err}")
                url_foto_publica = None

        # 2. Salva o registro de ponto na tabela 'registros' do PostgreSQL
        dados_registro = {
            "data": data_final,
            "hora": hora_final,
            "tipo": tipo,
            "empresa": empresa,
            "observacao": observacao,
            "foto_url": url_foto_publica
        }

        res = supabase.table("registros").insert(dados_registro).execute()
        item_salvo = res.data[0] if res.data else dados_registro

        return {
            "sucesso": True,
            "mensagem": f"Ponto de '{tipo}' salvo com sucesso!",
            "registro": item_salvo
        }

    except Exception as err:
        print(f"❌ Erro crítico no registro: {err}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao salvar: {str(err)}")