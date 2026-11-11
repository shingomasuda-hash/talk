"""最新版コールフローExcel（.xlsx）から図形・接続線・座標を抽出し source/flow-layout.json を作る。

使い方（標準ライブラリのみ）:
    python3 -I scripts/extract_callflow.py <コールフロー.xlsx> source/flow-layout.json

- workbook.xml → workbook.xml.rels → sheetN.xml.rels → drawingN.xml の順に対応を解決する。
- シート名が「使用しない」で始まるシートは不採用のため出力しない（件数のみ記録）。
- 図形の位置は a:xfrm（EMU, 9525 EMU = 1px）を使用。接続線は stCxn/endCxn の図形IDと接続点idx。
- 接続線に矢印（headEnd/tailEnd）があれば記録する（最新版では全接続線が矢印なし）。
"""
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
EMU_PX = 9525


def rels(z, path):
    base = posixpath.dirname(path)
    rp = posixpath.join(base, "_rels", posixpath.basename(path) + ".rels")
    root = ET.fromstring(z.read(rp))
    return {r.get("Id"): posixpath.normpath(posixpath.join(base, r.get("Target"))) for r in root.findall("pr:Relationship", NS)}


def text_of(el):
    paras = []
    for p in el.iter("{%s}p" % NS["a"]):
        paras.append("".join(t.text or "" for t in p.iter("{%s}t" % NS["a"])))
    return "\n".join(paras).strip()


def parse_drawing(xml):
    root = ET.fromstring(xml)
    shapes, cxns = [], []

    def walk(el):
        for ch in el:
            tag = ch.tag.split("}")[1]
            if tag == "sp":
                nv = ch.find("xdr:nvSpPr/xdr:cNvPr", NS)
                xf = ch.find("xdr:spPr/a:xfrm", NS)
                off, ext = xf.find("a:off", NS), xf.find("a:ext", NS)
                ln = ch.find("xdr:spPr/a:ln", NS)
                border = not (ln is not None and ln.find("a:noFill", NS) is not None)
                shapes.append({
                    "id": nv.get("id"),
                    "text": text_of(ch),
                    "x": round(int(off.get("x")) / EMU_PX, 1),
                    "y": round(int(off.get("y")) / EMU_PX, 1),
                    "w": round(int(ext.get("cx")) / EMU_PX, 1),
                    "h": round(int(ext.get("cy")) / EMU_PX, 1),
                    "border": border,
                })
            elif tag == "cxnSp":
                nv = ch.find("xdr:nvCxnSpPr/xdr:cNvPr", NS)
                c = ch.find("xdr:nvCxnSpPr/xdr:cNvCxnSpPr", NS)
                st, en = c.find("a:stCxn", NS), c.find("a:endCxn", NS)
                ln = ch.find("xdr:spPr/a:ln", NS)
                he = ln.find("a:headEnd", NS) if ln is not None else None
                te = ln.find("a:tailEnd", NS) if ln is not None else None
                geom = ch.find("xdr:spPr/a:prstGeom", NS)
                cxns.append({
                    "id": nv.get("id"),
                    "st": st.get("id") if st is not None else None,
                    "stIdx": int(st.get("idx")) if st is not None else None,
                    "en": en.get("id") if en is not None else None,
                    "enIdx": int(en.get("idx")) if en is not None else None,
                    "geom": geom.get("prst") if geom is not None else None,
                    "arrowHead": he.get("type") if he is not None else None,
                    "arrowTail": te.get("type") if te is not None else None,
                })
            elif tag == "grpSp":
                walk(ch)

    for anchor in root:
        walk(anchor)
    return shapes, cxns


def main(xlsx, out):
    z = zipfile.ZipFile(xlsx)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    wb_rels = rels(z, "xl/workbook.xml")
    result = {"source_file": posixpath.basename(xlsx), "sheets": [], "excluded_sheets": []}
    for sh in wb.find("m:sheets", NS):
        name = sh.get("name")
        sheet_path = wb_rels[sh.get("{%s}id" % NS["r"])]
        drawing = next((t for t in rels(z, sheet_path).values() if "/drawings/" in t), None)
        shapes, cxns = parse_drawing(z.read(drawing)) if drawing else ([], [])
        if name.startswith("使用しない"):
            result["excluded_sheets"].append({"sheet_name": name, "shape_count": len(shapes), "connector_count": len(cxns)})
            continue
        result["sheets"].append({"sheet_name": name, "drawing": drawing, "shapes": shapes, "connectors": cxns})
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    for s in result["sheets"]:
        print(f'{s["sheet_name"]}: 図形 {len(s["shapes"])} / 接続線 {len(s["connectors"])} / 矢印つき {sum(1 for c in s["connectors"] if c["arrowHead"] or c["arrowTail"])}')
    for s in result["excluded_sheets"]:
        print(f'除外: {s["sheet_name"]}（図形 {s["shape_count"]} / 接続線 {s["connector_count"]}）')


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
