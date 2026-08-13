import os
from datetime import datetime
import pytz
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from supabase import create_client, Client

app = FastAPI(title="Meu Controle Híbrido v2")

# Servir arquivos estáticos (HTML, CSS, JS, Imagens)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Conexão com o Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://awcfurzssrtvjuwqfebp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_hFUNm34QcB80l3SgQ_jfKQ_hyPjAKMY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BR_TZ = pytz.timezone('America/Sao_Paulo')


@app.get("/")
def home():
    """Servir a página principal da aplicação"""
    return FileResponse("static/index.html")


@app.get("/api/registros")
def listar_registros():
    """Busca todos os pontos salvos na tabela do Supabase"""
    try:
        response = supabase.table("registros").select("*").order("id", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar registros: {str(e)}")


@app.post("/api/registrar")
async def registrar_ponto(
    tipo: str = Form(...),
    empresa: str = Form("Vivo"),
    data_manual: str = Form(None),
    observacao: str = Form(""),
    latitude: float = Form(None),
    longitude: float = Form(None),
    foto: UploadFile = File(None)
):
    """Grava um novo ponto no Supabase"""
    agora_br = datetime.now(BR_TZ)
    data_registro = data_manual if data_manual else agora_br.strftime("%Y-%m-%d")
    hora_registro = agora_br.strftime("%H:%M:%S")
    foto_url = None

    if foto and foto.filename:
        try:
            timestamp = int(agora_br.timestamp())
            extensao = foto.filename.split(".")[-1]
            nome_arquivo = f"ponto_{timestamp}.{extensao}"
            conteudo_foto = await foto.read()

            supabase.storage.from_("comprovantes").upload(
                file=conteudo_foto,
                path=nome_arquivo,
                file_options={"content-type": foto.content_type}
            )

            foto_url = supabase.storage.from_("comprovantes").get_public_url(nome_arquivo)
        except Exception as e:
            print(f"Aviso: Erro no upload da imagem: {str(e)}")

    dados_ponto = {
        "data": data_registro,
        "hora": hora_registro,
        "tipo": tipo,
        "empresa": empresa,
        "observacao": observacao,
        "foto_url": foto_url,
        "latitude": latitude,
        "longitude": longitude
    }

    try:
        res = supabase.table("registros").insert(dados_ponto).execute()
        return {"sucesso": True, "mensagem": "Ponto registrado com sucesso!", "dados": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar registro: {str(e)}")


# ROTA PARA EXCLUIR UM PONTO REGISTRADO (DELETE)
@app.delete("/api/registros/{id_registro}")
def deletar_ponto(id_registro: int):
    """Remove permanentemente um ponto pelo seu ID"""
    try:
        supabase.table("registros").delete().eq("id", id_registro).execute()
        return {"sucesso": True, "mensagem": f"Registro #{id_registro} removido com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao excluir registro: {str(e)}")


# ROTA PARA ATUALIZAR TIPO OU OBSERVAÇÃO DE UM PONTO (UPDATE)
@app.put("/api/registros/{id_registro}")
def atualizar_ponto(id_registro: int, tipo: str = Form(...), observacao: str = Form("")):
    """Atualiza o tipo e a observação de um registro existente"""
    try:
        dados_atualizados = {"tipo": tipo, "observacao": observacao}
        supabase.table("registros").update(dados_atualizados).eq("id", id_registro).execute()
        return {"sucesso": True, "mensagem": f"Registro #{id_registro} atualizado!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar registro: {str(e)}")