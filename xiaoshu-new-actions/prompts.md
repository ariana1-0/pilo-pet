# 动作生成提示词

生成方式：内置 image_gen。
输入：原始角色设计参考图，仅作为角色身份和线条风格参考。

## 摘帽挠头
Use case: illustration-story.
Asset type: NEW animation production sprite sheet for a transparent animated desktop cat, NOT a poster, NOT a website. Image 1 is ONLY the identity and hand-drawn line-style reference. REDRAW every pose from scratch, do not reuse or rearrange the reference poses.
Primary request: 16 consecutive frames of the SAME cat taking off its black graduation cap, placing it on the floor, then repeatedly scratching and ruffling its head in extreme frustration. The visual storytelling must be readable WITHOUT A MOUTH.
CANVAS: square 2048 x 2048. Invisible exact 4 columns x 4 rows grid, 16 equal 512 x 512 cells. NO borders, NO labels, NO typography. Reading order left-to-right then top-to-bottom. One complete full-body cat per cell, same exact character model, camera, scale, torso position and floor baseline across all 16 cells. Feet baseline at about y=440 inside every cell. Body centered x=250. Keep all paws, ears, tail and hat entirely inside the cell with safe margins. No intercell overlap.
STYLE: user's little white fluffy scholar cat, oversized fluffy head, big round thick black wire glasses, short rounded body, triangular ears, white bushy curled tail, irregular slightly wobbly bold black hand-ink contours. White opaque fill inside the cat. Very simple sparse facial features. No nose, ABSOLUTELY NO MOUTH anywhere, no smile, no w-shape, no teeth, no tongue, no whiskers. Black pupils visible behind glasses. Act frustrated using pinched brows, squinting eyes, lowered ears, hunched shoulders and sharp messy crown tufts. Not happy, not waving, not playful. No collar, no bell, no book for this action. White body stays monochrome. Cap and tassel black. No color accents needed.
ANIMATION continuity:
Frame 1: sitting front-facing with slight 3/4 turn, cap on head, brows tense.
Frame 2: viewer-right forepaw lifts toward cap brim, worried squint.
Frame 3: same paw grips cap brim, elbow raised.
Frame 4: same paw lifts cap fully off crown, first white top tufts revealed.
Frame 5: paw moves cap down beside body on viewer-right.
Frame 6: cap set on ground at viewer-right, paw releases it; cap will STAY at that exact floor location in every following frame.
Frame 7: same forepaw bends upward toward the newly uncovered crown, the other forepaw supports body.
Frame 8: forepaw contacts crown between ear and forehead, eyes squeezed, shoulder hunched.
Frame 9: paw rubs downward across the crown in a short scratching arc; two tufts bending.
Frame 10: paw rubs upward, slightly tilted glasses, tousled tufts spring up.
Frame 11: second downward scratch, ears droop, fur now four irregular jagged tufts.
Frame 12: second upward scratch, paw pressed into fur, strongest frustrated squint.
Frame 13: third downward scratch, head subtly leans into paw, messy tufts.
Frame 14: third upward scratch, tousled fluff and irritated brows.
Frame 15: paw lowers beside cheek, exhausted annoyed half-closed eyes, extremely messy crown fur.
Frame 16: paw resting down, hunched exasperated pause, messy spiky crown, hat still beside the cat.
Hat, tail, body, glasses NEVER disappear or duplicate. Exactly four limbs total (two front, two rear). Same anatomy throughout; smooth small differences between neighboring frames, no arbitrary pose jumps.
BACKGROUND: genuine transparent alpha outside the character and cap. No scenery, no floor line, no decorative marks, no fake checkerboard, no shadows, no watermark. Keep WHITE fur opaque; black outlines fully closed. Do not fill any intercell space with color.

## 四爪奔跑
Use case: illustration-story.
Asset type: NEW looping quadruped running sprite sheet for animated scholar cat, NOT a design overview.
Image 1 is ONLY character identity and hand-ink style reference. Draw all new locomotion poses. DO NOT reuse its standing, reading, waving, or stretching poses.
Primary request: a coherent 12-frame FOUR-LEGGED feline gallop cycle, with real foreleg reach, hindleg drive, planted contact, compression and airborne extension. The cat runs ON ALL FOUR PAWS like an actual cat, NOT upright on two feet, NOT a person running, NOT walking. No book and nothing carried; all four paws are available for running.
CANVAS 2048 x 1536, exact invisible 4 columns x 3 rows grid. 12 equal square 512 x 512 cells, chronological left-to-right then top-to-bottom. NO grid lines, NO frame numbers, NO words.
Same complete cat centered in EVERY cell. Fixed 3/4 SIDE VIEW facing screen-left, so its round glasses and two slightly overlapping lenses remain recognizable while all four legs can be read. SAME orientation in every frame, SAME body size. Horizontal spine, head in front of chest, hindquarters at right, tail trails up right. Body remains around cell center; planted paws hit the same y=418 floor baseline. Full silhouette within each cell with generous 35px margin. No drifting across cells. This is a RUN-IN-PLACE loop ready to translate later, not multiple camera angles.
Character: little fluffy WHITE cat, large rounded fluffy head, oversized round black glasses, simple oval dark pupils, triangular ears, short fluffy legs, medium round belly, fluffy curved tail. Black mortarboard graduation cap stays seated on head, black tassel swings a little as secondary movement. Irregular bold black hand-drawn outline matching reference, opaque white fill. No shading on white body; no gray fur. ABSOLUTELY NO MOUTH, no nose, no smiling W-shape, no tongue, no muzzle expression. No collar, no bell. Intent focused and energetic, not distressed.
Gait: 12 evenly spaced phases of ONE full rotary gallop:
1 forepaws reaching forward to land, hindlegs extended backward.
2 leading forepaw contacts floor, other forepaw follows, rear legs swing forward.
3 weight lowered over bent forelegs, spine compresses, hindlegs tuck beneath belly.
4 hindpaws arrive under hips while forelegs begin lifting.
5 hindpaws plant, hindquarters crouch preparing power.
6 hindlegs push backward strongly, front paws sweep ahead.
7 airborne forward stretch, forelegs reach forward, hindlegs trail.
8 forepaws begin sweeping down, back arches slightly.
9 forelegs catch weight while hindlegs swing under.
10 body passes through a compact gathered airborne phase, all paws folded close.
11 body extends, leading front paw reaches ahead.
12 almost frame1 but one phase earlier for seamless loop.
Both front legs and both hind legs visibly alternate with small depth offsets; never grow extra limbs, never both rear legs magically become arms. Natural body bob of at most 20px, ears/glasses/tail/cap volume consistent. Smooth adjacent silhouettes and coherent paw arcs. Avoid 12 unrelated key poses.
BACKGROUND: genuinely transparent alpha outside each cat. Opaque white cat. No floor line, no speed lines, no dust, no environment, no shadows, no fake checkerboard, no text, no watermark.

## 后续校正
- 挠头：第 5、6 帧删除头顶重复的帽子；摘帽后把帽子保留在地面；保留动作姿态；棋盘格改为纯白背景。
- 奔跑：保留所有四爪姿态，棋盘格改为纯白背景。

