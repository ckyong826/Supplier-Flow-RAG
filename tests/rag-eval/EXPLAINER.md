# How this works / 这套东西是怎么运作的

A plain-language walkthrough. 用大白话解释。

**Current checkpoint / 当前进度:** Phase 1 is complete. The final fixture has 139 questions over
44 source documents; the live run passed 139/139 with 25/25 negatives and 0/25 hallucination.
Some examples below explain the original 50-question baseline; see `README.md` for the current
measurements.

---

## 0. The core idea / 核心概念

**EN.** RAG = "open-book exam". The AI model is a smart student who has *not* memorised your
product catalogue. So before it answers, we look up the relevant pages and put them on the desk
in front of it. The model then answers *from those pages*, not from memory.

Three roles:

| Role | In our system | Job |
| --- | --- | --- |
| The library | `knowledge_chunks` in Supabase | Stores your documents, cut into small pieces |
| The librarian | Retrieval (`knowledge-retrieval.mjs`) | Finds which pieces are relevant to the question |
| The student | DeepSeek | Reads only those pieces and writes the answer |

**中文。** RAG 就是「开卷考试」。AI 模型是一个聪明的学生，但它**没有背过**你的产品目录。
所以在它回答之前，我们先把相关的资料翻出来，摊在它桌上。它只能根据那几页纸回答，不能凭记忆乱讲。

三个角色：

| 角色 | 在我们系统里 | 工作 |
| --- | --- | --- |
| 图书馆 | Supabase 里的 `knowledge_chunks` | 存放你的文件，切成小块 |
| 图书管理员 | 检索模块 `knowledge-retrieval.mjs` | 找出哪几块跟问题有关 |
| 学生 | DeepSeek | 只读那几块，然后写出答案 |

**The key insight / 关键点：** if the librarian brings the wrong pages, the student cannot
possibly answer correctly — no matter how smart the student is. That's why we test the
librarian separately.
如果图书管理员拿错了资料，学生再聪明也答不对。所以我们要**单独测试图书管理员**。

---

## 1. Putting documents in (ingest) / 第一步：存入文件

**EN.** When you upload a document via `POST /api/admin/knowledge`:

1. **Cut it up.** The text is split into pieces of 100 words each ("chunks"). Why? Because
   sending a whole document to the AI wastes space and dilutes the answer. Small pieces are
   more precise.
2. **Turn each piece into numbers.** OpenAI's `text-embedding-3-small` converts each chunk into
   a list of 1536 numbers (an "embedding"). Think of it as a coordinate describing *meaning*.
   Two chunks about delivery times land near each other; a chunk about warranty lands far away.
3. **Save both.** The original text and the 1536 numbers go into the `knowledge_chunks` table.

**中文。** 当你通过 `POST /api/admin/knowledge` 上传文件时：

1. **切块。** 文字被切成每块 100 个词。为什么？因为把整份文件塞给 AI 很浪费，而且会稀释重点。
   小块比较精准。
2. **把每块变成数字。** OpenAI 的 `text-embedding-3-small` 把每一块转换成 1536 个数字
   （叫「向量 / embedding」）。你可以把它想成一个描述**语意**的坐标。
   两块都在讲送货时间的内容，坐标会很接近；讲保固的那块，坐标就离很远。
3. **两个都存起来。** 原文和那 1536 个数字，一起存进 `knowledge_chunks` 表。

> **The bug we found / 我们发现的问题：** step 2 was silently skipped because `OPENAI_API_KEY`
> was missing. Every chunk was saved with `embedding = NULL`. The library existed, but every
> book had a blank spine — the librarian couldn't find anything by meaning.
> 第二步其实一直被跳过了，因为当时没有设 `OPENAI_API_KEY`，所以每一块的 `embedding` 都是空的。
> 等于图书馆有书，但书背上没写字，管理员根本没办法照「意思」找书。

---

## 2. Finding the right pieces (retrieval) / 第二步：找出相关内容

There are two ways to be a librarian. / 当图书管理员有两种做法。

### Method A — keyword / 方法一：关键字

**EN.** Count shared words between the question and each chunk. Most shared words wins.

- Good at: exact codes. `A9F73140` either appears or it doesn't.
- Bad at: different wording. Ask "out of stock" when the document says "unavailable" → zero
  shared words → finds nothing.

**中文。** 数一数问题和每一块之间有多少个相同的字词，最多的赢。

- 擅长：精确型号。`A9F73140` 要嘛出现，要嘛没出现，很干脆。
- 不擅长：换句话说。你问「缺货」，文件写的是「无法提供」→ 没有共同字词 → 找不到。

### Method B — vector / 方法二：向量（语意搜寻）

**EN.** Turn the *question* into 1536 numbers too, then find the chunks whose numbers are
closest. Closeness = similar meaning.

- Good at: different wording. "out of stock" and "unavailable" land close together.
- Bad at: near-identical codes. `F202A` and `F202AC` mean almost the same thing to the maths,
  so it may confuse them — and in your catalogue they are genuinely different products.

**中文。** 把**问题**也转成 1536 个数字，然后找出数字最接近的那几块。接近 = 意思相近。

- 擅长：换句话说。「缺货」和「无法提供」的坐标会很靠近。
- 不擅长：几乎一样的型号。对数学来说 `F202A` 和 `F202AC` 意思几乎相同，可能会搞混 —
  但在你的目录里，这是两个真正不同的产品。

### Which is better? / 哪个比较好？

**EN.** Neither, universally. That's exactly why I built the A/B harness instead of just
picking one. Your catalogue is full of near-identical SKUs, which is keyword's home ground —
but your policy questions get asked in everyday language, which is vector's. `hybrid` runs
both and merges the results.

**中文。** 没有绝对的赢家。所以我做的是 A/B 对比工具，而不是直接帮你选一个。
你的产品目录充满了长得几乎一样的型号，这是关键字的强项；
但客户问政策问题时会用日常口语，这是向量的强项。`hybrid` 模式两个都跑，然后合并结果。

---

## 3. Writing the answer (generation) / 第三步：产生答案

**EN.** The top few chunks are pasted into the instructions given to DeepSeek, under a heading
`SUPPORT KNOWLEDGE:`. The instructions also say: only use these facts, and if a value isn't
here, say you don't have it.

**中文。** 找到的前几块内容会被贴进给 DeepSeek 的指令里，放在 `SUPPORT KNOWLEDGE:` 底下。
指令还会说明：只能用这些资料；如果某个数值不在里面，就要老实说没有。

> **The dangerous case / 最危险的情况：** a customer asks "what's the SST rate?". Your SOP
> mentions the word "SST" but never gives a percentage. So retrieval confidently returns that
> chunk, the model sees "SST" right there in the context, and invents "6%". It looks
> authoritative and it is completely made up.
> 客户问「SST 税率是多少？」。你的 SOP 里有提到「SST」这个词，但从来没写出百分比。
> 检索会很有信心地把那块拿出来，模型一看上下文里真的有「SST」，就自己编了一个「6%」。
> 看起来很专业，其实完全是捏造的。
>
> This is why the 10 negative questions exist, and why we added a similarity floor.
> 这就是那 10 道「陷阱题」存在的原因，也是我们加上相似度门槛的原因。

---

## 4. What each file does / 每个档案在做什么

### The test set / 测试题库

**`rag-eval-questions.json`** — 50 questions with the correct answer for each.
50 道题目，每题都附上正确答案。

- 30 **direct lookups** — normal questions with one clear answer. 普通题，答案很明确。
- 10 **adversarial** — deliberately tricky. Near-identical SKUs, questions needing 2-3
  documents at once. 故意刁难的题目：长得几乎一样的型号、需要同时查 2–3 份文件的题目。
- 10 **negative** — the answer is **not** in your documents. The correct behaviour is to say
  "I don't have that." 答案**根本不在**你的文件里。正确的行为是回答「我没有这个资料」。

**Why negatives matter most / 为什么陷阱题最重要：** a bot that answers 40 questions correctly
but invents a price on the 41st is worse than useless — a customer may act on that price.
一个答对 40 题、但第 41 题自己编了个价格的机器人，比没有还糟糕 —— 客户可能真的照那个价格下单。

### The safety checks / 安全检查

**`verify-groundtruth.mjs`** — checks the *question set itself* before it grades anything.
在用题库打分之前，先检查**题库本身**对不对。

**EN.** If my "correct answer" is wrong, every score afterwards is meaningless. This confirms
every expected fact really does appear in the document I claimed it came from.
**中文。** 如果我写的「标准答案」本身就错了，后面所有分数都没有意义。
这个脚本确认每个标准答案，真的出现在我标注的那份文件里。

> This caught two real bugs in my own work: grading rules loose enough that `type A` matched
> inside `type AC`, and hallucination-detection patterns that were written wrong and would
> **never have fired** — meaning the 10 trap questions would have shown a fake 100% pass.
> 这个检查抓到我自己写错的两个 bug：一个是判断规则太宽松，`type A` 会错误地匹配到 `type AC` 里面；
> 另一个是抓捏造答案的规则写错了，**永远不会触发** —— 也就是说那 10 道陷阱题会显示假的满分。

**`grader.test.mjs`** / **`retrieval-modes.test.mjs`** — test the testing tools themselves.
测试「测试工具」本身。A broken grader silently reports success. 坏掉的评分器会安静地报「全部通过」。

### The runners / 执行工具

| File 档案 | What it does 做什么 | Needs 需要 |
| --- | --- | --- |
| `run-retrieval-eval.mjs` | Tests the librarian only. Did the right document get found? 只测图书管理员：有没有找到对的文件？ | Nothing 什么都不用 |
| `run-ab-retrieval.mjs` | Compares keyword vs vector vs hybrid. 比较三种检索方式 | Supabase + OpenAI |
| `run-live-eval.mjs` | Tests the whole thing end to end, including whether it makes things up. 整套端到端测试，包含会不会乱编 | Server + all keys 服务器 + 所有金钥 |

### The new pieces / 新增的东西

**`supabase/migrations/0002_vector_retrieval.sql`**

**EN.** Adds a *similarity floor*. Before this, the search always returned 5 chunks — even for
a question with no answer in the corpus, it returned the 5 least-bad ones. That is the setup
for fabrication. Now, if nothing is similar enough, it returns **zero**, and the model is told
there is no supporting document.
**中文。** 加上「相似度门槛」。在这之前，搜寻永远会回传 5 块 —— 就算问题的答案根本不在资料库里，
它还是会回传「最不糟的 5 块」。这正是捏造答案的温床。
现在如果没有够接近的内容，就回传**零块**，然后告诉模型：没有相关资料。

**`scripts/backfill-embeddings.mjs`**

**EN.** Fills in the missing 1536-number codes for chunks saved before the key existed.
Setting the key only helps *new* uploads — old rows stay blank forever without this.
Run `--dry-run` first to see the current state.
**中文。** 帮那些在设金钥之前存进去、缺少 1536 个数字的旧资料补上。
设了金钥只对**新上传**的有效，旧资料不跑这个脚本就永远是空的。
建议先跑 `--dry-run` 看看目前状况。

**`app/api/ai-chat/knowledge-retrieval.mjs`**

**EN.** The librarian, rewritten to support all three methods. Controlled by `RETRIEVAL_MODE`.
**Default is `keyword`, so nothing changes until you deliberately switch it.**
**中文。** 图书管理员，改写成支援三种方式，用 `RETRIEVAL_MODE` 控制。
**预设是 `keyword`，所以在你主动切换之前，行为完全不变。**

One important detail: if the vector search *breaks* (no key, API down), it falls back to
keyword so the chat keeps working. But if the vector search *legitimately finds nothing*, it
does **not** fall back — because that empty result is the whole point. Falling back there would
hand the model exactly the weak context we were trying to suppress.
一个重要细节：如果向量搜寻**故障**（没金钥、API 挂掉），它会退回用关键字，让聊天继续运作。
但如果向量搜寻是**正常地找不到东西**，它就**不会**退回 —— 因为「找不到」本身就是答案。
这时候退回去，等于把我们刚刚努力挡掉的劣质资料又塞回给模型。

---

## 5. What we found / 我们发现了什么

**EN.** Keyword retrieval got the right document ranked first only **62.5%** of the time. In
**all 15** failures, the same file beat it: `rag-benchmark-sources.md`.

That file is just a list of source URLs. But the URLs contain the product codes, like
`...idpn-n-vigi-1p-n-25a-c-curve-6000a-a-type-30ma-a9d32625.html`. Since the scoring just
counts word matches, that file scores highly on almost any product question — while containing
no real answers.

Removing it from the index: **62.5% → 100%**.

**中文。** 关键字检索只有 **62.5%** 的情况下，把正确文件排在第一名。
而且在**全部 15 次**失败中，赢过它的都是同一个档案：`rag-benchmark-sources.md`。

那个档案其实只是一份来源网址清单。但网址里包含产品型号，例如
`...idpn-n-vigi-1p-n-25a-c-curve-6000a-a-type-30ma-a9d32625.html`。
因为评分方式只是数字词有没有出现，这个档案在几乎所有产品问题上分数都很高 ——
但它里面根本没有真正的答案。

把它从索引中移除：**62.5% → 100%**。

> One caveat / 一个但书：that file holds exactly one fact the main knowledge file lacks (the
> Type 3 SPD / 10 m rule). Move that fact over first, then remove the file.
> 那个档案里有**一条**主知识档没有的资料（Type 3 突波保护器 / 10 公尺的规则）。
> 先把那条搬过去，再移除档案。

---

## 6. What to run / 你要执行什么

> **Important / 重要：** the `.md` files in `data/` are **not** the database. They are just
> files on your disk. The chatbot reads from Supabase tables, so the documents must be
> *imported* first — otherwise the library is empty and every policy question fails, no matter
> how good the retrieval is.
> `data/` 里的 `.md` 档案**不等于**资料库，它们只是你硬碟里的档案。
> 聊天机器人是从 Supabase 的资料表读取的，所以必须先**汇入**。
> 不汇入的话，图书馆是空的，再好的检索也答不出任何政策问题。

```bash
# 1. Apply the migration 套用资料库迁移
psql "$DATABASE_URL" -f supabase/migrations/0002_vector_retrieval.sql

# 2. Import the knowledge base into the database 把知识库汇入资料库
#    (chunks + embeds in one step 切块和转向量一次完成)
node scripts/import-knowledge.mjs --dry-run    # preview 先预览
node scripts/import-knowledge.mjs

# 3. Compare the three methods 比较三种方式
node tests/rag-eval/run-ab-retrieval.mjs --json tests/rag-eval/results-ab.json

# 4. Only then decide 看完数据再决定
#    .env: RETRIEVAL_MODE=vector  (or hybrid 或 hybrid)
```

`backfill-embeddings.mjs` is only for rows imported *before* the OpenAI key existed. A fresh
import embeds as it goes.
`backfill-embeddings.mjs` 只是用来补那些「在设 OpenAI 金钥之前」就存进去的旧资料。
用汇入脚本重新汇入的话，会边汇入边转向量，不需要另外补。

**EN.** Send me the output of step 3 and we'll read the tradeoff together. Do not switch the
mode before seeing those numbers — vector is not automatically better for a catalogue full of
near-identical part numbers.

**中文。** 把第 3 步的结果给我，我们一起看取舍。
在看到数据之前不要切换模式 —— 对一个满是相似料号的产品目录来说，向量检索不一定比较好。
