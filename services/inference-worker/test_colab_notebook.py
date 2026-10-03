import json
from pathlib import Path


def test_colab_notebook_cells_compile_and_have_clear_success_gates():
    notebook_path = Path(__file__).parents[2] / "notebooks" / "tryon_studio_colab.ipynb"
    notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
    cells = ["".join(cell["source"]) for cell in notebook["cells"] if cell["cell_type"] == "code"]
    assert len(cells) == 6
    for source in cells:
        compile(source, str(notebook_path), "exec")
    assert "--prepare-only" in cells[2]
    assert "--preview" in cells[3]
    assert "--output" in cells[4]
    assert "--no-autoupdate" not in "\n".join(cells)
