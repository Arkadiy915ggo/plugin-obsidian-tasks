# Project Docs Bridge: план реализации

## Назначение документа

Этот файл является самостоятельной спецификацией для следующей сессии разработки. Перед реализацией нужно прочитать документ целиком, затем выполнять этапы по порядку. Не заменять описанную архитектуру виртуальными `TFile`, подменой адаптера Obsidian или симлинками.

## Контекст и цель

Нужно добавить в этот репозиторий второй Obsidian-плагин. Рабочее имя:

- ID: `project-docs-bridge`;
- название: `Project Docs Bridge`.

Плагин предназначен для проекта со структурой примерно такого вида:

```text
my-project/
  .git/
  README.md
  packages/
    api/
      docs.md
      architecture.excalidraw
      diagram.png
  .project-vault/
    .obsidian/
    doc/
```

`my-project/.project-vault` открыт как отдельный Obsidian vault. Плагин должен показывать документацию из родительского репозитория внутри реальной папки vault, по умолчанию `doc`, с сохранением структуры исходных каталогов:

```text
my-project/packages/api/docs.md
  <->
my-project/.project-vault/doc/packages/api/docs.md
```

Требования:

- находить все Markdown-файлы, `.excalidraw` и `.excalidraw.md` в репозитории;
- показывать их в стандартном File Explorer Obsidian под одной настраиваемой папкой;
- поддерживать стандартный Markdown preview, редактор, поиск, ссылки, backlinks и Excalidraw;
- синхронизировать изменения в обе стороны;
- работать в desktop Obsidian на Ubuntu и Windows;
- переносить локальные изображения и PDF, на которые ссылаются Markdown/Excalidraw;
- не терять данные при одновременном изменении обеих копий;
- не требовать работы Obsidian Sync, но безопасно обрабатывать изменения зеркала, пришедшие через Sync;
- генерируемое зеркало не должно храниться в Git.

## Ключевое техническое решение

### Почему нельзя сделать виртуальное дерево

Публичный API Obsidian не позволяет зарегистрировать виртуальные `TFile`/`TFolder` в стандартном файловом дереве. `TFile` создаются и индексируются самим `Vault`. Подмена `Vault.adapter`, изменение внутренних коллекций или monkey patch File Explorer являются неподдерживаемыми решениями и сломают часть функций: metadata cache, ссылки, поиск, rename, редактор или Excalidraw.

### Выбранная архитектура

Использовать физическое зеркало внутри vault и двусторонний sync engine:

```text
исходный файл репозитория <-> файл-зеркало внутри vault
```

Все операции с зеркалом выполнять через публичный `Vault`/`FileManager` API. Все операции с исходным репозиторием выполнять через Node.js `fs/promises`. Поэтому manifest нового плагина должен содержать `"isDesktopOnly": true`.

Симлинки не использовать: они непереносимы между Ubuntu/Windows, плохо сочетаются с Obsidian Sync и официально имеют ограничения в Obsidian.

## Уже принятые продуктовые решения

- Vault является подпапкой репозитория.
- Исходный корень по умолчанию равен `..` относительно корня vault.
- Корень зеркала внутри vault по умолчанию называется `doc`.
- Синхронизация двусторонняя.
- При конфликте нельзя молча выбирать более новую копию: сохранить обе версии и запросить решение пользователя.
- MVP поддерживает desktop Ubuntu и Windows.
- Локальные изображения и PDF, реально используемые документацией, зеркалируются с сохранением относительных путей.
- Зеркало исключается из Git.
- Obsidian Sync является опциональным и не входит в обязательный transport плагина.

## Что не входит в MVP

- прямой доступ к репозиторию на Android/iOS;
- виртуальные файлы в core File Explorer;
- Git commit, pull, push, checkout или merge из плагина;
- автоматический текстовый three-way merge конфликтов;
- слежение за файлами вне настроенного source root;
- зеркалирование всех бинарных файлов репозитория;
- следование filesystem symlink/junction внутри source root;
- совместная синхронизация нескольких source roots;
- поддержка исходного корня по сети или на временно отключаемом диске как основного сценария.

## Репозиторий с несколькими плагинами

Текущий репозиторий является одно-плагинным: `main.ts`, `manifest.json`, `package.json` и README относятся к `Rule Based Daily Tasks`. Перед добавлением второго плагина преобразовать репозиторий в npm workspaces monorepo.

Целевая структура:

```text
plugin-obsidian-tasks/
  package.json
  package-lock.json
  README.md
  tsconfig.base.json
  plugins/
    rule-based-daily-tasks/
      main.ts
      main.js
      manifest.json
      package.json
      README.md
      tsconfig.json
      esbuild.mjs
    project-docs-bridge/
      main.ts
      main.js
      manifest.json
      package.json
      README.md
      tsconfig.json
      esbuild.mjs
      src/
      tests/
```

Правила миграции:

1. Сначала выполнить `git status --short` и `git diff`.
2. В текущем рабочем дереве уже могут быть незакоммиченные изменения в `README.md`, `main.ts` и сгенерированном `main.js`. Их нельзя сбрасывать или заменять старыми версиями.
3. Перенести существующий плагин без функциональных изменений и убедиться, что его build всё ещё проходит.
4. Сделать корневой `package.json` приватным и добавить workspaces `plugins/*`.
5. Добавить корневые scripts `build`, `build:tasks`, `build:docs` и `test`.
6. Использовать общий root `package-lock.json`; не создавать независимые lock-файлы в каждом workspace.
7. `main.js` остаётся build artifact каждого плагина. Не редактировать его вручную.
8. Корневой README должен только перечислять плагины и ссылаться на их README.

Рекомендуемые корневые команды:

```json
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "build:tasks": "npm run build --workspace rule-based-daily-tasks",
    "build:docs": "npm run build --workspace project-docs-bridge",
    "test": "npm run test --workspaces --if-present"
  }
}
```

Если миграция monorepo мешает проверке sync engine, выполнить её отдельным первым этапом и не смешивать с функциональными изменениями существующего плагина.

## Структура нового плагина

Не складывать весь sync engine в `main.ts`. Достаточное разбиение:

```text
plugins/project-docs-bridge/
  main.ts                    # lifecycle, регистрация команд и событий
  src/settings.ts            # settings, defaults, SettingsTab
  src/types.ts               # manifest entry, conflict, sync status
  src/path-policy.ts         # normalize/map/validate/ignore
  src/source-store.ts        # Node fs, scan, hash, atomic write, watcher
  src/vault-store.ts         # только публичный Vault API
  src/asset-references.ts    # поиск локальных image/PDF references
  src/reconcile.ts           # чистая таблица решений
  src/sync-engine.ts         # очередь, initial sync, events, manifest
  src/conflict-modal.ts      # список и разрешение конфликтов
  tests/
```

Допустимо объединить небольшие файлы, но чистую функцию принятия sync-решения и path policy нужно держать независимо от Obsidian API, чтобы их можно было полноценно тестировать в Node.

Зависимости:

- runtime: `chokidar` для watcher исходного дерева;
- runtime: `picomatch` или эквивалент для пользовательских ignore patterns;
- dev: `vitest` для unit tests;
- существующие `typescript`, `esbuild`, `obsidian`, `@types/node`.

Не добавлять базу данных и тяжёлый framework.

## Настройки

Минимальный интерфейс настроек:

```ts
interface ProjectDocsBridgeSettings {
  sourceRoot: string;
  mirrorRoot: string;
  excludePatterns: string[];
  assetExtensions: string[];
  syncOnStartup: boolean;
  watchForChanges: boolean;
  debounceMs: number;
}
```

Defaults:

```ts
{
  sourceRoot: "..",
  mirrorRoot: "doc",
  excludePatterns: [
    ".git/**",
    "node_modules/**",
    "**/.obsidian/**",
    ".project-docs-trash/**"
  ],
  assetExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"],
  syncOnStartup: true,
  watchForChanges: true,
  debounceMs: 750
}
```

Обязательные элементы SettingsTab:

- source root с отображением вычисленного абсолютного пути;
- mirror root;
- многострочное поле ignore patterns, один glob на строку;
- список разрешённых attachment extensions;
- toggle startup sync;
- toggle watcher;
- debounce;
- read-only статус: initialized/paused/syncing/conflicts/error;
- кнопка `Validate configuration`;
- кнопка `Initialize mirror`;
- кнопка `Sync now`;
- кнопка `Pause/Resume`;
- кнопка `Open conflicts`.

Изменение source root или mirror root не должно мгновенно удалять старые файлы. После сохранения настройки остановить watcher, валидировать новый путь и запросить явную повторную инициализацию.

## Проверка и безопасность путей

До первого сканирования:

1. Проверить, что `app.vault.adapter` является `FileSystemAdapter`.
2. Получить абсолютный vault root через `FileSystemAdapter.getBasePath()`.
3. Если `sourceRoot` относительный, разрешить его относительно vault root.
4. Выполнить `realpath` для существующих root-каталогов.
5. Проверить, что vault root является дочерним каталогом source root и не равен ему.
6. Разрешить `mirrorRoot` только как нормализованный относительный vault path.
7. Запретить пустой `mirrorRoot`, `.`, `/`, `..`, `.obsidian` и выход через `../`.
8. Всегда исключать весь абсолютный vault root из source scan независимо от настроек пользователя. Это защита от рекурсивного `doc/.project-vault/doc/...`.
9. Не следовать symlink/junction. Если real path кандидата выходит из source root, пропустить его и записать warning.
10. На Windows сравнивать canonical paths без учёта регистра и корректно обрабатывать `\`/`/`.
11. До записи повторно проверять, что source target остаётся внутри source root, а mirror target внутри mirror root.

Наличие `.git` в source root проверять как полезный warning, но не как обязательное условие: Git worktree может иметь `.git` в виде файла.

## Правила выбора файлов

### Документы

Всегда управляемые типы:

- `*.md`, включая `*.excalidraw.md`;
- `*.excalidraw`.

Сравнение extension на Windows и Ubuntu делать без учёта регистра, но сохранять исходное имя.

### Вложения

При initial scan и полном reconcile:

1. Найти все документы.
2. Прочитать ссылки на локальные вложения.
3. Добавить существующие файлы с extension из `assetExtensions`.
4. Сохранить их относительный путь, не переписывая содержимое Markdown/Excalidraw.
5. Продолжать управлять attachment, уже записанным в sync manifest, даже если ссылка на него временно удалена. Автоматический prune не делать в MVP.

Поддержать минимум:

- Markdown embeds: `![](../images/a.png)`;
- Markdown links на файлы: `[scheme](../files/scheme.pdf)`;
- wiki embeds: `![[image.png]]` и `![[folder/image.png]]`;
- wiki links на PDF;
- URL encoded paths;
- ссылки с `#fragment` и `?query`, которые нужно удалить перед filesystem resolve;
- секцию embedded files формата Excalidraw Markdown;
- локальные file references в legacy `.excalidraw`, если они представлены обычным path/link в JSON.

Не считать локальными `http:`, `https:`, `data:`, `obsidian:`, `mailto:` и абсолютные внешние пути.

Разрешение wiki basename без папки:

1. Сначала путь относительно текущего документа.
2. Затем путь относительно source root.
3. Затем поиск по basename среди source files.
4. Если найдено несколько кандидатов, ничего не копировать и показать warning с документом и неоднозначной ссылкой.

Ссылка на файл вне source root должна быть пропущена с warning. Плагин не должен расширять доступ за пределы проекта.

### Новые вложения из Obsidian

Если пользователь вставил изображение или PDF внутрь mirror root, событие vault `create` должно создать соответствующий source-файл и добавить его в manifest. Это нужно для paste в Markdown и Excalidraw.

В README указать рекомендуемую настройку Obsidian attachment location: `Same folder as current file` либо папка внутри `doc`. Attachment, созданный вне mirror root, плагин не синхронизирует.

## Отображение путей

Для одного source root отображение всегда взаимно однозначное:

```text
source relative: packages/api/docs.md
mirror relative: doc/packages/api/docs.md
```

Нельзя flatten-ить каталоги или разрешать два source-файла в один mirror path.

На case-insensitive filesystem обнаруживать коллизии вроде `Docs/A.md` и `docs/a.md`. Не перезаписывать один файл другим; пометить оба как path conflict.

Все vault paths перед API-вызовом пропускать через `normalizePath` Obsidian.

## Persisted state

Хранить settings и sync manifest через plugin data (`loadData`/`saveData`). Запись состояния debounce-ить и выполнять только после успешной файловой операции.

Минимальная модель:

```ts
interface SyncManifestEntry {
  relativePath: string;
  kind: "document" | "attachment";
  baseHash: string;
  sourceHash: string | null;
  mirrorHash: string | null;
  status: "active" | "conflict" | "tombstone";
  conflict?: {
    sourceHash: string | null;
    mirrorHash: string | null;
    createdAt: string;
    snapshotFolder: string;
  };
}

interface PersistedData {
  schemaVersion: 1;
  initialized: boolean;
  settings: ProjectDocsBridgeSettings;
  entries: Record<string, SyncManifestEntry>;
}
```

Ключ manifest строить из canonical source-relative path. На Windows нормализовать lookup key к lower case, но отдельно хранить оригинальный регистр пути.

`baseHash` является SHA-256 содержимого последней версии, которая точно была одинаковой с обеих сторон. `mtime` и size можно хранить как optimization hint, но нельзя использовать вместо content hash при конфликте.

При изменении schemaVersion добавить явную migration; не пытаться молча читать несовместимую структуру.

## Initial bootstrap

Первый запуск должен быть безопаснее обычной двусторонней синхронизации.

1. Без `initialized: true` не запускать автоматические записи в source root.
2. Показать Notice и предложить открыть settings/выполнить `Initialize mirror`.
3. После подтверждения просканировать source и существующий mirror.
4. Если mirror-файла нет, скопировать source в mirror.
5. Если обе копии равны, принять их как baseline.
6. Если обе копии существуют и различаются, создать conflict; ничего не перезаписывать.
7. Если файл есть только в старом mirror, не создавать его автоматически в source при bootstrap. Переместить его в conflict snapshot/quarantine и показать пользователю.
8. Только после успешного прохода сохранить manifest и `initialized: true`.

Это защищает от stale-копии, приехавшей через Obsidian Sync на новую машину.

## Reconcile algorithm

Вынести решение в чистую функцию, которая получает наличие и hashes `base`, `source`, `mirror` и возвращает action. Основная таблица:

| Состояние | Действие |
|---|---|
| `source == mirror` | обновить `baseHash`, ничего не писать |
| изменился только source | source -> mirror |
| изменился только mirror | mirror -> source |
| обе стороны изменились и теперь равны | принять новую общую версию |
| обе стороны изменились по-разному | conflict, ничего не перезаписывать |
| новый source, mirror отсутствует | создать mirror |
| новый mirror после initialization, source отсутствует | создать source |
| обе стороны отсутствуют | удалить active entry после tombstone retention |

Удаления для существующей manifest entry:

| Состояние | Действие |
|---|---|
| source отсутствует, mirror равен base | переместить mirror в Obsidian trash, создать tombstone |
| mirror отсутствует, source равен base | переместить source в quarantine, создать tombstone |
| одна сторона удалена, другая изменена после base | conflict delete-vs-modify |
| обе стороны удалены | tombstone без восстановления |

Никогда не выбирать победителя только по `mtime`.

## Запись файлов

### В vault

Использовать только публичные API:

- `Vault.create`/`Vault.modify` для UTF-8 text;
- `Vault.createBinary`/`Vault.modifyBinary` для attachments;
- `Vault.createFolder` для родителей;
- `Vault.rename` для rename, пришедшего из source;
- `FileManager.trashFile` для удаления mirror-файла.

Не писать mirror через Node `fs`: Obsidian должен получить корректные create/modify/delete events и обновить metadata cache.

При external rename использовать `Vault.rename`, а не `FileManager.renameFile`: плагин должен точно отразить состояние Git working tree и не менять исходные Markdown links за спиной пользователя. Если rename начат в Obsidian, core FileManager сам обновит ссылки согласно настройкам пользователя; эти modify events затем синхронизируются в source.

### В source root

- Для text писать UTF-8.
- Для attachments писать bytes без преобразования.
- Записывать во временный файл в том же каталоге, затем делать atomic rename.
- На Windows предусмотреть retry для кратковременного `EPERM`/file lock.
- Для case-only rename на Windows использовать временное промежуточное имя.
- Перед hash/read большого файла проверить stat до и после чтения; если файл менялся во время чтения, повторить позже.

## Удаление и quarantine

MVP не должен необратимо удалять source-файлы.

- Удаление source пользователем приводит к `FileManager.trashFile` зеркала.
- Удаление mirror-файла приводит к перемещению source в `<sourceRoot>/.project-docs-trash/<timestamp>/<relativePath>`.
- `.project-docs-trash/**` всегда игнорируется scanner/watcher.
- README должен рекомендовать добавить `.project-docs-trash/` в `.gitignore`.
- Tombstone не даёт следующему scan немедленно восстановить удалённый файл с другой стороны.
- Постоянная очистка quarantine не входит в MVP.

Перед массовым удалением обязательно проверить, что source root существует, vault находится внутри ожидаемого source root и scan не завершился ошибкой. Ошибка/недоступность root никогда не трактуется как «все source-файлы удалены».

## Rename

Watcher часто сообщает rename как `unlink + add`. В одном debounce batch:

1. Сопоставить исчезнувший и новый путь по content hash.
2. При наличии нескольких одинаковых hashes считать rename неоднозначным и оставить delete/create либо запросить решение.
3. Source rename отразить через `Vault.rename`.
4. Vault rename отразить через `fs.rename` source-файла.
5. Folder rename обрабатывать как набор descendant renames в одной очереди.
6. После rename обновить manifest key/path только после успешной операции с обеих сторон.

## Конфликты

Конфликт не должен менять ни текущий source, ни текущий mirror.

Создать snapshots под зарезервированным, исключённым из sync каталогом:

```text
doc/_project-docs-conflicts/2026-07-21T120000Z/packages/api/docs/
  docs.source.md
  docs.vault.md
  conflict.json
```

Для delete-vs-modify сохранить отсутствующую сторону как metadata в `conflict.json`, а существующую как snapshot.

Требования:

- один и тот же конфликт не создавать повторно на каждом watcher event;
- хранить hashes конфликтных версий в manifest;
- показать Notice и увеличить conflict count в status bar;
- команда `Open conflicts` открывает modal со списком;
- для каждого конфликта дать действия `Keep source`, `Keep vault`, `Open source snapshot`, `Open vault snapshot`;
- перед `Keep ...` повторно проверить hashes: если файл изменился после создания конфликта, потребовать новый reconcile;
- выбранную версию записать на обе стороны, обновить `baseHash`, снять status conflict;
- если пользователь вручную сделал обе стороны одинаковыми, разрешить конфликт автоматически;
- snapshots не удалять автоматически сразу после resolution; оставить для ручной очистки.

Для бинарного attachment использовать те же правила без попытки merge.

## Watchers и защита от циклов

Источники событий:

- `chokidar` для source root;
- `app.vault.on("create" | "modify" | "delete" | "rename")` для mirror root.

Правила:

1. Все события складывать в одну serial `ReconcileQueue`; одновременно работает только один reconcile.
2. События debounce-ить. Git checkout может создать большую burst-серию.
3. Во время reconcile собирать новые dirty paths и запускать ещё один проход после текущего.
4. После записи хранить expected destination hash. Полученный watcher event игнорировать только если фактический hash равен expected hash.
5. Не игнорировать события только по времени: это может скрыть реальную пользовательскую правку.
6. Source watcher должен всегда игнорировать vault root, `.git`, `node_modules`, quarantine и user patterns.
7. Vault listener должен реагировать только на mirror root и пропускать conflict folder.
8. После больших batches или watcher overflow запускать полный inventory reconcile.
9. При unload остановить приём событий, дождаться/отменить очередь безопасно, закрыть chokidar и сбросить pending manifest save.

Obsidian Sync, если пользователь включит его для mirror, будет выглядеть как обычные vault events. Если source не менялся после `baseHash`, изменения Sync можно перенести в source. Если source тоже изменился, должен возникнуть обычный conflict.

## Lifecycle и команды

`onload`:

1. Загрузить и валидировать persisted data.
2. Зарегистрировать SettingsTab, commands и status bar.
3. Дождаться `workspace.onLayoutReady`.
4. Если плагин не initialized, показать Notice без автоматической записи.
5. Если initialized и `syncOnStartup`, выполнить initial reconcile.
6. Только после успешного reconcile запустить watchers.

Команды MVP:

- `Project Docs Bridge: Initialize mirror`;
- `Project Docs Bridge: Sync now`;
- `Project Docs Bridge: Pause sync` / `Resume sync`;
- `Project Docs Bridge: Open conflicts`;
- `Project Docs Bridge: Open mirror folder`;
- `Project Docs Bridge: Show sync status`.

Status bar:

- `Docs: synced`;
- `Docs: syncing`;
- `Docs: paused`;
- `Docs: N conflicts`;
- `Docs: error`.

Не выводить Notice на каждый обычный файл; для batch показывать один summary.

## Git и Obsidian Sync

Плагин не должен сам менять `.gitignore`. README должен объяснить два варианта.

Если весь vault локальный и не хранится в Git:

```gitignore
.project-vault/
.project-docs-trash/
```

Если пользователь хочет хранить часть настроек vault в Git, минимум исключить зеркало и volatile files:

```gitignore
.project-vault/doc/
.project-vault/.trash/
.project-vault/.obsidian/workspace*.json
.project-docs-trash/
```

Obsidian Sync:

- рекомендуемый простой режим: исключить `doc` из Sync и на каждой desktop-машине пересобирать зеркало из локального Git checkout;
- опциональный режим: включить `doc` в Sync для чтения/редактирования на mobile;
- на mobile сам desktop-only plugin не работает, но реальные mirror-файлы остаются обычными файлами vault;
- после mobile-редактирования desktop-плагин увидит vault change и перенесёт его в локальный source либо создаст conflict;
- manifest/config sync между машинами не должен считаться гарантированным transport; корректность определяется hashes текущих файлов.

## Логирование и диагностика

Добавить небольшой logger с уровнями info/warn/error и префиксом `[Project Docs Bridge]`.

Не логировать содержимое документов. Логировать:

- относительный путь;
- направление операции;
- тип action;
- длительность scan;
- количество документов/attachments/conflicts;
- ошибки filesystem/API.

Команда `Show sync status` должна показывать source root, mirror root, время последнего успешного sync, длину очереди, число managed files и conflicts. Absolute path допустим только в локальном modal/console, но не в conflict Markdown, который может попасть в Sync.

## Порядок реализации

### Этап 0. Сохранить текущий плагин и создать monorepo

- Проверить dirty worktree.
- Перенести Rule Based Daily Tasks в workspace без изменения поведения.
- Настроить root workspaces/scripts.
- Обновить README.
- Выполнить build существующего плагина.

Checkpoint: `npm run build:tasks` проходит, diff существующего `main.ts` является только переносом плюс уже имевшиеся пользовательские изменения.

### Этап 1. Skeleton нового плагина

- Создать package, manifest с `isDesktopOnly: true`, build и test config.
- Добавить settings, commands, status bar.
- Реализовать path validation и mapping.
- Пока не писать файлы.

Checkpoint: новый плагин загружается в desktop Obsidian, validation правильно показывает source/mirror.

### Этап 2. Односторонний bootstrap source -> mirror

- Реализовать source scan документов.
- Добавить SHA-256 и persisted manifest.
- Создавать папки/файлы зеркала через Vault API.
- Реализовать безопасный повторный `Sync now` без лишних writes.
- Обработать существующий отличающийся mirror как conflict, не overwrite.

Checkpoint: Markdown и `.excalidraw` появляются в `doc` с исходной иерархией и открываются стандартными Obsidian views.

### Этап 3. Связанные attachments

- Реализовать parser ссылок.
- Добавить image/PDF closure.
- Копировать binary через Vault API.
- Добавить ambiguity/outside-root warnings.
- Проверить Excalidraw с локальным изображением.

Checkpoint: preview Markdown и Excalidraw отображают локальные assets без переписывания исходных ссылок.

### Этап 4. Двусторонняя синхронизация

- Реализовать pure reconcile decision table.
- Добавить vault events и source chokidar.
- Добавить serial queue, debounce и expected hashes.
- Поддержать create/modify в обе стороны.
- Поддержать attachments, созданные Obsidian внутри mirror root.

Checkpoint: редактирование в IDE и Obsidian отражается на другой стороне без watcher loop.

### Этап 5. Rename, delete, conflict

- Добавить rename pairing.
- Добавить quarantine/tombstones.
- Добавить conflict snapshots и modal resolution.
- Добавить protection от массового delete при scan failure.
- Проверить case-only rename на Windows.

Checkpoint: ни один сценарий simultaneous edit/delete-vs-modify не приводит к молчаливой потере данных.

### Этап 6. Надёжность и UX

- Добавить watcher recovery/full reconcile.
- Добавить batch summaries, status modal и понятные errors.
- Добавить pause/reconfigure flow.
- Проверить unload/reload/restart.
- Описать Git ignore и Obsidian Sync режимы.

Checkpoint: после перезапуска состояние восстанавливается, повторный scan идемпотентен.

### Этап 7. Проверка Ubuntu и Windows

- Выполнить unit/integration suite.
- Провести manual acceptance matrix на обеих ОС.
- Проверить build обоих plugins из root.
- Не выпускать plugin до успешной проверки Windows paths и case rename.

## Автоматические тесты

### Path policy

- relative source root `..`;
- absolute source root;
- POSIX и Windows separators;
- запрет traversal `../` для mirror;
- vault subtree всегда ignored;
- symlink escape rejected;
- case collision detected;
- mapping source <-> mirror обратимо.

### Reconcile decision table

Покрыть каждую строку таблиц create/modify/delete, включая:

- обе стороны равны;
- source-only change;
- mirror-only change;
- same simultaneous change;
- different simultaneous change;
- delete-vs-unchanged;
- delete-vs-modify;
- both deleted;
- tombstone не восстанавливает файл.

### Asset references

Fixtures для Markdown, wiki embeds, URL encoded paths, fragments, PDF, Excalidraw Markdown, legacy Excalidraw JSON, remote URLs, ambiguous basename и outside-root path.

### Queue и loops

- burst из нескольких modify даёт один конечный reconcile;
- event от собственной записи с expected hash не запускает обратную запись;
- реальная правка, пришедшая сразу после собственной записи, не теряется;
- событие во время active reconcile запускает следующий проход;
- failed write не обновляет `baseHash`.

### Filesystem integration

На временных каталогах:

- bootstrap;
- text и binary round trip;
- atomic source write;
- rename;
- quarantine;
- restart с persisted manifest;
- partial scan failure не вызывает удаления.

Obsidian API обернуть небольшим `VaultStore` interface; pure logic не должна импортировать runtime `obsidian`, иначе Vitest будет трудно запускать.

## Ручная acceptance matrix

Выполнить отдельно на Ubuntu и Windows:

1. Vault лежит внутри Git repository, default source `..`, mirror `doc`.
2. Initial sync сохраняет вложенные каталоги.
3. `.git`, `node_modules` и сам vault не попадают в mirror.
4. Markdown открывается в source/editing/preview режимах.
5. `.excalidraw` и `.excalidraw.md` открываются установленным Excalidraw plugin.
6. Картинка и PDF по относительной ссылке доступны.
7. Правка в IDE появляется в открытой заметке Obsidian.
8. Правка и создание заметки в Obsidian появляются в source tree.
9. Paste изображения внутри mirror создаёт source attachment.
10. Rename/move из Obsidian переносит source и синхронизирует обновлённые core links.
11. Rename из IDE/Git переносит mirror без неожиданной правки других source-файлов.
12. Delete source отправляет mirror в Obsidian trash.
13. Delete mirror перемещает source в quarantine.
14. Одновременная разная правка создаёт один conflict и сохраняет обе версии.
15. Git checkout с большим количеством событий завершается корректным full reconcile.
16. Pause действительно останавливает запись; Resume выполняет reconcile.
17. Reload plugin и restart Obsidian не создают лишних конфликтов.
18. Если source scan падает, файлы массово не удаляются.
19. Mirror path отсутствует в `git status` после добавления рекомендуемого `.gitignore`.
20. При включённом Obsidian Sync изменение mirror обрабатывается как vault change; при одновременной source-правке создаётся conflict.

## Критерии готовности MVP

MVP готов, если одновременно выполнено следующее:

- оба plugins собираются отдельными и общей root-командой;
- существующий Rule Based Daily Tasks не получил поведенческих регрессий;
- Project Docs Bridge использует только публичный Obsidian API для mirror;
- source root и mirror root валидируются до записи;
- все `.md`, `.excalidraw` и `.excalidraw.md` отражаются с полной иерархией;
- связанные локальные изображения/PDF работают;
- create/modify/rename/delete работают в обе стороны;
- conflicts не перезаписываются автоматически;
- watcher loop отсутствует;
- зеркало и quarantine исключены из Git;
- automatic tests проходят;
- manual matrix пройдена на Ubuntu и Windows;
- README содержит установку, настройки attachment folder, `.gitignore`, ограничения mobile и варианты Obsidian Sync.

## Известные риски

- Excalidraw меняет внутренний формат embedded files; нужны реальные fixtures из поддерживаемой версии плагина.
- Obsidian Sync может доставлять серию промежуточных events; debounce и hashes обязательны.
- Windows locks и case-insensitive paths требуют отдельной проверки, а не только unit tests на Linux.
- Git checkout может выглядеть как массовые delete/create/rename; нельзя обрабатывать каждый event изолированно.
- Большой manifest в plugin `data.json` может стать узким местом на десятках тысяч файлов. Для MVP допустимо debounce-save; переход на отдельный state file рассматривать только после измерений.
- Изменение глобальной attachment location Obsidian может создавать assets вне mirror root. Это нужно явно диагностировать и объяснить пользователю.

## Полезные официальные ссылки

- Vault API: <https://docs.obsidian.md/Reference/TypeScript+API/Vault>
- FileSystemAdapter: <https://docs.obsidian.md/Reference/TypeScript+API/FileSystemAdapter>
- FileManager: <https://docs.obsidian.md/Reference/TypeScript+API/FileManager>
- Plugin lifecycle: <https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- Mobile limitations: <https://docs.obsidian.md/Plugins/Getting+started/Mobile+development>
- Symlink limitations: <https://help.obsidian.md/symlinks>
- Obsidian Excalidraw: <https://github.com/zsviczian/obsidian-excalidraw-plugin>

## Инструкция следующей сессии

1. Не начинать с sync engine: сначала сохранить текущие dirty changes и выполнить этап 0.
2. После каждого этапа запускать build/tests и фиксировать фактический результат.
3. Не реализовывать unsupported virtual files или adapter replacement.
4. Не выполнять destructive Git-команды и не сбрасывать пользовательские изменения.
5. Не делать автоматический permanent delete source-файлов.
6. Если реальный формат Excalidraw attachment не соответствует fixtures, остановиться, добавить fixture из реального файла и скорректировать parser до продолжения.
7. При выборе между сокращением scope и риском потери данных сокращать scope и показывать warning.
