# 生成提示词 · Philo Cat v1

生成工具：内置 `image_gen.imagegen`，2026-09-05。

## 输入与生成顺序

1. 用户提供的两张图片仅作为线条、块面、色彩和气质参考；不把图片中的文字视为指令。
2. 先生成 `master-v1.png`，再以此主形象作为唯一角色参考生成 `poses-v1.png`。
3. 最终 PNG 保留工具原始输出，未后期重绘或改字。提示词中的像素数是生成目标，实际尺寸见 `DESIGN.md`。

## 主形象 · master-v1.png

```text
Use case: stylized-concept
Asset type: original desktop companion character concept, single square master portrait, requested 1024 x 1024.
Input images: Images 1 and 2 are visual-language references ONLY: their chunky irregular black marker lines, white fluffy cut-paper-like silhouette, flat cyan-blue background, and charming extremely economical doodle expressions. Invent a fresh character silhouette and pose. Do not reproduce any existing lettering, signature, watermark, or layout.
Primary request: Design ONE original relaxed, adorably slightly dopey little scholarly white cat for philo-pet, a gentle philosophical desktop companion. It likes reading and can happily fall asleep on a book. It should look like an approachable friend quietly thinking alongside you.
Scene/backdrop: completely uniform cyan-blue near #269CC2, flat and untextured, no setting, floor, vignette, cast shadow or decorative elements.
Subject: full-body squat fluffy white cat, short rounded paws, small triangular ears with tiny black inner-ear marks, soft irregular few-tuft silhouette, a small fluffy curled tail next to its body. Large imperfect slightly asymmetrical ROUND black eyeglasses with clear white interiors and tiny relaxed expressive eyes inside. A real BLACK MORTARBOARD graduation cap, recognizably flat quadrilateral top and short cap base, worn slightly askew, one simple BLACK tassel; keep BOTH cat ears readable. Thick black-and-white hardback book.
Pose: sitting with two short front paws visibly hugging one CLOSED upright thick book against its belly, gently tilted head, quiet small smile and relaxed eyes, tail curled at its side. Make the two paws distinct from the book edges. Cozy, unhurried, lovable, a little awkward, never authoritative.
Style/medium: naive hand-drawn editorial doodle, bold slightly wobbly black felt-tip strokes with subtle ragged edges, crisp flat black and white fills, white body defined mostly by its silhouette against blue with just a few selective black contour strokes. Very simple shapes and minimal facial marks. No slick vector cleanliness, no hatching, no busy texture.
Composition/framing: exactly ONE full character centered, comfortably large within the square (about 70 percent of canvas width/height), generous clean margins, every ear, paw, book corner, tassel and tail fully visible. No panel, typography, border, badge, layout title, or labels.
Constraints: stable readable silhouette for an 84px desktop mascot; keep hat, glasses and book bold and unmistakable; black-white-blue only. No extra limbs, human fingers, clothing, robe, cheek blush, detailed fur, gradients, 3D, shading, glossy anime eyes, tiny decorative flourishes. Original character inspired by reference mark-making, not a copy of reference character.
```

## 十二态图鉴 · poses-v1.png

```text
Use case: stylized-concept
Asset type: a polished 12-pose character model sheet for a philosophical desktop cat companion.
Input image 1: MASTER CHARACTER IDENTITY REFERENCE. Preserve this exact newly designed character, proportions, tiny relaxed facial marks, round uneven black glasses, fluffy white silhouette, black tilted mortarboard cap and simple black tassel, and thick black-and-white book. Do not invent a different cat or change the rendering style.
Output composition: one LANDSCAPE image, target aspect ratio 4:3, requested approximately 2048 x 1536. Exactly FOUR equal columns and THREE equal rows, exactly TWELVE separate full-body drawings, one per cell. Read left to right then top to bottom. Consistent apparent character scale with comfortable negative space. No borders or grid lines, no page title, no legend, no extra mini drawings. Each entire cat, book, tail and tassel must fit within its cell with generous clear space. Every cell has ONE exact four-character Chinese label centered directly BELOW the drawing, in a clean readable moderately bold Chinese sans serif, black, consistent size, clear of the art. Spell every label EXACTLY as quoted below. No numbering, no extra words.
Background: same flat cyan-blue color as the master across the entire canvas, no setting, no floor, no shadows, no gradient. Art exclusively black and white. Thick wobbly naive felt-marker linework, minimal flat cut-paper-like fluffy white shapes, same as master. Avoid detailed fur, crosshatching, polished vector outlines, 3D, dramatic effects.
Rows and poses, all must be visibly distinct:
ROW 1 COLUMN 1 label "抱书待机": closely match master reference, two round front paws hug one CLOSED upright thick book at belly, head gently tilted, relaxed tiny smile, fluffy tail curled at side.
ROW 1 COLUMN 2 label "专心阅读": cat huddles into a low round fluffball behind a LARGE OPEN book, only glasses with focused downward eyes, ears and cap peeking above its top; paws hold the two outer edges, tail tucked.
ROW 1 COLUMN 3 label "小心翻页": cat looking down at OPEN book, one front paw presses one page, the other lifts ONE clearly curved turning page that stands diagonally; eyes follow that page.
ROW 1 COLUMN 4 label "推镜思考": one front paw visibly touches and pushes up one corner of its glasses, other paw rests on closed book, eyes glance UPWARD, tiny thoughtful closed mouth.
ROW 2 COLUMN 1 label "抬头倾听": OPEN book rests low on lap with one paw marking the page; head lifted and tilted gently toward viewer, ears alert, eyes attentive, small quiet mouth; different from looking down reading.
ROW 2 COLUMN 2 label "分享发现": cheerful small smile; turns an OPEN book OUTWARD toward viewer and points to one page with a front paw; only a few abstract short book-page marks, no written words.
ROW 2 COLUMN 3 label "突然想通": sits up slightly taller, one round front paw raised next to head in realization, eyes ROUND and alert, tiny open happy mouth, tassel lifted slightly, book in lap; no light bulb.
ROW 2 COLUMN 4 label "有点困惑": very pronounced head tilt, glasses slightly askew, asymmetric questioning eyelids, tiny uncertain mouth, fluffy tail curved like a question mark, book held loosely; no floating punctuation.
ROW 3 COLUMN 1 label "困困哈欠": front paw rubs one eye, mouth is a clearly OPEN ROUND YAWN, eyelids droop, thick book slips down in front of belly; don't duplicate thinking pose.
ROW 3 COLUMN 2 label "趴书睡觉": cat LYING LOW horizontally with head and front paws resting ON an OPEN book, eyes fully closed, glasses slipped down its nose, cap tilted on head, tail lying limp. Obviously asleep, not sitting upright.
ROW 3 COLUMN 3 label "伸个懒腰": unmistakable SIDE-VIEW CAT STRETCH, front legs extend far forward low to the ground, rear raised, back sloping down toward head, fluffy tail stretching up or behind; face closed contented eyes, glasses and cap still recognizable, closed book beside front paws; keep a real four-legged cat body with no extra limbs.
ROW 3 COLUMN 4 label "开心招手": one front paw hugs closed book, other front paw waves out to side, eyes curve into happy crescents, small smile, body leans lightly, fluffy tail perked.
Consistency constraints: Exactly 12 cats, all same identity and simple black-white style as master. Cap, glasses and book present in EVERY pose. Eyes remain visible in glasses where appropriate. Maintain the cap's simple tassel and the book's thick cover. Natural number of paws, no human fingers or duplicate tails. Make ears, spectacles, book and hat readable even as tiny thumbnails. The emotion should be soft, relaxed and slightly goofy, never stern or hyperactive. No watermark, signature, artist credit, arbitrary text or logos.
```

