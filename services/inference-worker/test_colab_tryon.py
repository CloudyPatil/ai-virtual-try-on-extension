import pytest
from PIL import Image
import sys
import types

from colab_tryon import main, make_mask, parse_box, preview


def test_normalized_box_validation():
    assert parse_box("0.1,0.2,0.8,0.9", "upper") == (0.1, 0.2, 0.8, 0.9)
    with pytest.raises(ValueError, match="Mask box"):
        parse_box("0.8,0.2,0.1,0.9", "upper")
    with pytest.raises(ValueError, match="Mask box"):
        parse_box("0.1,0.2,0.8", "upper")


def test_mask_and_preview_are_nonempty(tmp_path):
    person = Image.new("RGB", (768, 1024), "white")
    mask = make_mask(person, parse_box(None, "upper"))
    assert mask.getpixel((384, 400)) > 200
    assert mask.getpixel((0, 0)) == 0
    output = tmp_path / "mask-preview.png"
    preview(person, mask, output)
    assert Image.open(output).size == person.size


def test_preview_cli_does_not_load_model(monkeypatch, tmp_path):
    repo = tmp_path / "CatVTON"
    repo.mkdir()
    person = tmp_path / "person.png"
    garment = tmp_path / "garment.png"
    preview_path = tmp_path / "preview.png"
    Image.new("RGB", (300, 400), "white").save(person)
    Image.new("RGB", (300, 400), "blue").save(garment)
    monkeypatch.setitem(sys.modules, "utils", types.SimpleNamespace(
        resize_and_crop=lambda image, size: image.resize(size),
        resize_and_padding=lambda image, size: image.resize(size),
    ))
    monkeypatch.setattr(sys, "argv", [
        "colab_tryon.py", "--catvton-repo", str(repo),
        "--person", str(person), "--garment", str(garment),
        "--preview", str(preview_path),
    ])
    main()
    assert Image.open(preview_path).size == (768, 1024)
