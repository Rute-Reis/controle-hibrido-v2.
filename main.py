import os
from datetime import datetime
import pytz
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from supabase import create_client, Client

# -----------------------------------------------------------------------------
# 1. INICIALIZAÇÃO DA APLICAÇÃO FASTAPI
# -----------------------------------------------------------------------------
# Instancia o aplicativo FastAPI com o título do projeto.
app = FastAPI(title="Meu Controle Híbrido v2")

# Mapeia a pasta 'static' para servir arquivos estáticos (index.html, app.js, CSS, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

# -----------------------------------------------------------------------------
# 2. CONFIGURAÇÃO E CONEXÃO COM O SUPABASE
# -----------------------------------------------------------------------------
# Busca as credenciais nas variáveis de ambiente ou utiliza os valores padrão.
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://awcfurzssrtvjuwqfebp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_hFUNm34QcB80l3SgQ_jfKQ_hyPjAKMY")

# Inicializa o cliente do Supabase para comunicação com o banco e o storage
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Define o fuso horário oficial do Brasil para salvar horários corretos
BR_TZ = pytz.timezone('America/Sao_Paulo')


# -----------------------------------------------------------------------------
# 3. ROTAS DA APLICAÇÃO (ENDPOINTS)
# -----------------------------------------------------------------------------

@app.get("/")
def home():
    """
    ROTA RAIZ: Entrega o arquivo index.html principal localizado na pasta 'static'.
    """
    return FileResponse("static/index.html")


@app.get("/api/registros")
def listar_registros():
    """
    CONSULTAR REGISTROS (READ):
    Busca todos os pontos gravados no Supabase ordenados do mais recente para o mais antigo.
    """
    try:
        # Executa consulta na tabela 'registros' ordenando por 'id' decrescente
        response = supabase.table("registros").select("*").order("id", desc=True).execute()
        return response.data
    except Exception as e:
        # Retorna erro HTTP 500 em caso de falha de conexão ou consulta
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
    """
    CRIAR REGISTRO (CREATE):
    Recebe os dados do formulário multipart/form-data, processa a foto (se houver)
    e grava as informações no banco de dados.
    """
    agora_br = datetime.now(BR_TZ)
    
    # Se uma data manual não for informada, utiliza a data atual do Brasil
    data_registro = data_manual if data_manual else agora_br.strftime("%Y-%m-%d")
    hora_registro = agora_br.strftime("%H:%M:%S")
    foto_url = None

    # Lógica de upload de comprovante de foto no Supabase Storage
    if foto and foto.filename:
        try:
            timestamp = int(agora_br.timestamp())
            extensao = foto.filename.split(".")[-1]
            nome_arquivo = f"ponto_{timestamp}.{extensao}"
            conteudo_foto = await foto.read()

            # Envia a foto para o bucket 'comprovantes'
            supabase.storage.from_("comprovantes").upload(
                file=conteudo_foto,
                path=nome_arquivo,
                file_options={"content-type": foto.content_type}
            )

            # Obtém a URL pública do arquivo enviado
            foto_url = supabase.storage.from_("comprovantes").get_public_url(nome_arquivo)
        except Exception as e:
            print(f"Aviso: Erro no upload da imagem: {str(e)}")

    # Dicionário de dados a ser inserido no Supabase
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
        # Inserção na tabela 'registros'
        res = supabase.table("registros").insert(dados_ponto).execute()
        return {"sucesso": True, "mensagem": "Ponto registrado com sucesso!", "dados": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar registro: {str(e)}")


@app.delete("/api/registros/{id_registro}")
def deletar_ponto(id_registro: int):
    """
    EXCLUIR REGISTRO (DELETE):
    Remove um registro específico do banco de dados utilizando o ID fornecido na URL.
    """
    try:
        supabase.table("registros").delete().eq("id", id_registro).execute()
        return {"sucesso": True, "mensagem": f"Registro #{id_registro} removido com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao excluir registro: {str(e)}")


@app.put("/api/registros/{id_registro}")
def atualizar_ponto(id_registro: int, tipo: str = Form(...), observacao: str = Form("")):
    """
    ATUALIZAR REGISTRO (UPDATE):
    Altera as informações de tipo e observação de um registro já gravado.
    """
    try:
        dados_atualizados = {"tipo": tipo, "observacao": observacao}
        supabase.table("registros").update(dados_atualizados).eq("id", id_registro).execute()
        return {"sucesso": True, "mensagem": f"Registro #{id_registro} atualizado!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar registro: {str(e)}")