# Handoff — Produtos/backend para mapa e capas

## Mapa

O catálogo público de 28/08/2026 contém 71 imóveis e nenhuma coordenada válida. O frontend não deve geocodificar endereço privado, deslocar pontos nem inventar coordenadas.

Contrato necessário: localização pública segura, aprovada para o Site, com precisão definida pelo negócio, entregue pela visão canônica de Produtos. Critérios: latitude/longitude numéricas dentro da região atendida; imóvel despublicado deixa de ser retornado; endereço privado não é exposto; atualização acompanha publicação/despublicação.

## Capas

A amostra inicial contém fotos verticais recortadas em cards horizontais e o endpoint `site-media` entrega somente o original. Produtos precisa oferecer:

- `foto_principal_id` obrigatório para publicação;
- `foco_x`/`foco_y` ou enquadramento editorial da capa;
- validação de resolução mínima, duplicidade, luminosidade e orientação;
- preview do card 4:3 antes da aprovação;
- variantes seguras 480/768/1200 px em AVIF/WebP/JPEG pelo identificador opaco da mídia;
- cache imutável por versão do ativo.

Nenhuma dessas pendências foi simulada no frontend desta branch.
