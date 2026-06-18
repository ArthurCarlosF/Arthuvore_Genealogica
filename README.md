# Raízes

MVP de uma plataforma colaborativa para cadastro, conexão, busca e visualização de árvores genealógicas.

## O que já funciona

- Cadastro de pessoa com nome, nascimento, documento, documentos dos pais, e-mail, senha e foto.
- Conexão automática quando documentos coincidem.
- Busca por nome, sobrenome ou documento.
- Visualização por até 6 graus de relacionamento.
- Indicação de pai ou mãe referenciado, mas ainda não cadastrado.
- Indicação de “filho não cadastrado” quando nenhuma pessoa da base referencia alguém como pai ou mãe.
- Edição protegida pela senha do registro.
- Exportação da árvore em SVG.
- Página de instruções com explicação do funcionamento e passo a passo do cadastro.
- Modo demonstração local e integração com Google Sheets/Drive por Apps Script.

## Executar localmente

Sirva a pasta com um servidor HTTP. Por exemplo:

```powershell
python -m http.server 4173
```

Abra `http://localhost:4173`. O modo demonstração vem ativado. A senha dos registros de exemplo é `demo1234`.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos.
2. Em **Settings > Pages**, escolha **Deploy from a branch**.
3. Selecione a branch `main` e a pasta `/ (root)`.
4. Aguarde o endereço público ser criado.

Não coloque IDs de planilha, chaves ou outros segredos neste repositório.

## Configurar o Google Apps Script

1. Crie uma planilha Google vazia e copie o ID que aparece entre `/d/` e `/edit` na URL.
2. Abra [script.google.com](https://script.google.com), crie um projeto e copie o conteúdo de `apps-script/Code.gs`.
3. Em **Configurações do projeto > Propriedades do script**, crie:
   - `SPREADSHEET_ID`: ID da planilha.
   - `PASSWORD_PEPPER`: texto aleatório longo, secreto e único.
4. Em **Implantar > Nova implantação**, escolha **Aplicativo da Web**.
5. Execute como você e permita acesso a qualquer pessoa.
6. Autorize Planilhas e Drive e copie a URL terminada em `/exec`.
7. No site, clique em **Configurar API**, cole a URL e desative o modo demonstração.

O Apps Script criará a aba `Pessoas` e a pasta `Raizes - Fotos` automaticamente.

## Modelo e limitações

Cada pessoa é um vértice. Os campos `fatherDocument` e `motherDocument` criam as arestas. Isso permite que ilhas separadas sejam unidas automaticamente quando um documento intermediário é cadastrado.

“Pai/mãe não cadastrado” significa que existe um documento de pai ou mãe informado, mas ainda sem cadastro correspondente. “Filho não cadastrado” é exibido quando nenhum registro da base referencia a pessoa como pai ou mãe. Essa segunda indicação significa apenas “nenhum filho encontrado na base”; ela não confirma que a pessoa tenha ou não filhos fora do sistema.

## Antes de oferecer como serviço pago

Este MVP valida interface e modelo, mas Apps Script/Sheets não é uma infraestrutura adequada para uma base pública grande. Para comercialização, migre o backend para PostgreSQL ou um banco de grafos, use autenticação real, rate limiting, auditoria, backups, exclusão de conta e controles compatíveis com a LGPD.

CPF, e-mail, parentesco e fotografia são dados pessoais. Uma operação pública exige base legal, política de privacidade, consentimento verificável, canal para correção/exclusão e análise jurídica. Para produção, também é recomendável criptografar documentos no banco e manter um índice hash separado para busca exata.
