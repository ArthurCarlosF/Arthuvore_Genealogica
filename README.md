# Arthuvore Genealógica

Rede genealógica colaborativa com contas individuais e relações familiares confirmadas.

## Funcionalidades

- Cadastro e login por e-mail e senha.
- ID interno automático para cada usuário.
- Perfil com nome, ano de nascimento, sexo e foto.
- Busca por nome e/ou ano de nascimento.
- Solicitações para adicionar pai, mãe ou filho.
- Vínculo criado somente depois do aceite.
- Árvore com três graus por padrão e filtro de até seis graus.
- Exportação em SVG.
- Painel de solicitações recebidas e enviadas.

## Arquitetura

- Frontend estático publicado no GitHub Pages.
- API criada com Google Apps Script.
- Google Sheets armazena usuários, solicitações e sessões.
- Google Drive armazena fotos.
- Senhas são armazenadas como hash com salt e pepper, nunca em texto puro.
- Sessões utilizam tokens aleatórios com validade de 30 dias.

## Configurar o Apps Script

1. Abra o projeto em [script.google.com](https://script.google.com).
2. Substitua o conteúdo de `Code.gs` pelo arquivo `apps-script/Code.gs`.
3. Em **Configurações do projeto > Propriedades do script**, configure:

```text
SPREADSHEET_ID = ID da planilha
PASSWORD_PEPPER = texto secreto, longo e aleatório
```

4. Em **Implantar > Gerenciar implantações**, edite o aplicativo Web.
5. Selecione **Nova versão**.
6. Configure:

```text
Executar como: você
Quem pode acessar: qualquer pessoa
```

7. Clique em **Implantar**.

A URL `/exec` deve retornar:

```json
{"ok":true,"data":{"service":"Arthuvore API","version":2}}
```

As abas `Usuarios`, `Solicitacoes` e `Sessoes` serão criadas automaticamente.

## Segurança e limites

Essa estrutura é adequada para um MVP e uma comunidade pequena. Para uso comercial em grande escala, é recomendável migrar autenticação, banco e rate limiting para uma infraestrutura dedicada.

Não coloque `PASSWORD_PEPPER` ou outros segredos no GitHub.

## Publicação

O frontend é publicado pelo GitHub Pages a partir da branch `main`.
