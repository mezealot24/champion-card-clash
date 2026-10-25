# Builds the 24-frame pose strips in src/pages/sprites/ (cells 320x270, see POSES in src/pages/fighters.ts)
# from Q's 4x6 atlases (512px cells, Champion_Card_Clash_120_Sprites_and_24Action_Atlases/Master_24Action_SpriteSheets).
# Frames 0-7 keep the cells of the current strips (body at x 160); frames 8-23 are scaled to match them and centred on
# their drawing, lowest pixel at y 262.
# Usage: python3 -I scripts/cut-pose-sheets.py <atlas dir> <dir with the current 8-frame strips> <out dir>
import sys
from PIL import Image

ATLAS, OLD, OUT = sys.argv[1:4]
CW, CH, BX, FY = 320, 270, 160, 262
SHEETS = [('Assassin_Female', 'as'), ('Mage_Pyromancer_Male', 'mg-1'), ('Mage_Cryomancer_Female', 'mg-2'), ('Bruiser_Male', 'br'), ('Tank_Male', 'tk')]
# Two atlases follow their own Sheet 2 prompt order instead of the slot table (class_mechanic / exhaust / low_hp)
REMAP = {'tk': {12: 13, 13: 12}, 'br': {11: 13, 13: 11}}


def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()


for name, key in SHEETS:
    atlas = Image.open(f'{ATLAS}/{name}_24Actions_SpriteSheet.png').convert('RGBA')
    old = Image.open(f'{OLD}/{key}.webp').convert('RGBA')
    remap = REMAP.get(key, {})

    def cell(i):
        j = remap.get(i, i)
        return atlas.crop((j % 4 * 512, j // 4 * 512, j % 4 * 512 + 512, j // 4 * 512 + 512))

    # one scale per Champion: the atlas draws frames 0-7 at a fixed size relative to the current strip
    ratios = sorted((o[3] - o[1]) / (n[3] - n[1]) for n, o in ((bbox(cell(i)), bbox(old.crop((i * CW, 0, i * CW + CW, CH)))) for i in range(8)))
    s = ratios[len(ratios) // 2]
    strip = Image.new('RGBA', (CW * 24, CH), (0, 0, 0, 0))
    strip.paste(old.crop((0, 0, CW * 8, CH)), (0, 0))
    sz = round(512 * s)
    for i in range(8, 24):
        im = cell(i).resize((sz, sz), Image.LANCZOS)
        b = bbox(im)
        dx = max(-b[0], min(CW - b[2], round(BX - (b[0] + b[2]) / 2)))
        dy = max(-b[1], FY - b[3])
        canvas = Image.new('RGBA', (CW + 2 * sz, CH + 2 * sz), (0, 0, 0, 0))
        canvas.alpha_composite(im, (sz + dx, sz + dy))
        strip.alpha_composite(canvas.crop((sz, sz, sz + CW, sz + CH)), (i * CW, 0))
    strip.save(f'{OUT}/{key}.webp', quality=80, method=6)
    print(key, f'scale {s:.3f}')
