# Arthuvore Genealógica

Árvore genealógica pública e colaborativa. Não exige login: qualquer pessoa pode cadastrar, consultar e complementar registros.

## Cadastro

Campos obrigatórios:

- Nome completo da pessoa.
- Nome completo do pai.
- Nome completo da mãe.

Detalhes opcionais:

- Data de nascimento da pessoa.
- Data de nascimento do pai.
- Data de nascimento da mãe.
- Nomes dos quatro avós.

Os detalhes opcionais ajudam a diferenciar homônimos e tornam as conexões mais confiáveis.

## Correspondência

O sistema normaliza nomes, ignorando acentos, pontuação, maiúsculas e espaços duplicados.

- Nenhuma pessoa cadastrada com o nome: perfil provisório.
- Uma pessoa compatível: conexão automática.
- Mais de uma pessoa igualmente compatível: estado ambíguo com interrogação.
- Datas e nomes dos avós aumentam a pontuação de uma correspondência.
- Dados conflitantes eliminam um candidato.
- Campo opcional vazio continua compatível.

## Apps Script

1. Copie `apps-script/Code.gs` para o projeto.
2. Mantenha `SPREADSHEET_ID` nas propriedades do script.
3. Crie uma nova versão da implantação como aplicativo Web.
4. Execute como você e permita acesso a qualquer pessoa.

A URL `/exec` deve retornar:

```json
{"ok":true,"data":{"service":"Arthuvore API","version":4}}
```

A aba `PessoasV4` será criada automaticamente.

## Observação

Como qualquer visitante pode editar registros, esta versão prioriza simplicidade. Para uso público amplo, recomenda-se adicionar histórico de alterações, moderação, backups e proteção contra automações.
