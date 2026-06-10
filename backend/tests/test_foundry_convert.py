"""pickle -> safetensors conversion. torch.load(weights_only=True) is the
security boundary: tensor deserialization only, never arbitrary unpickling."""

import sys
import unittest
from unittest.mock import MagicMock, patch

import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.convert import ConvertUnavailableError, convert_pickle_to_safetensors


class ConvertTests(unittest.TestCase):
    def test_torch_missing_raises_typed_unavailable(self):
        with patch.dict(sys.modules, {"torch": None, "safetensors.torch": None}):
            with self.assertRaises(ConvertUnavailableError):
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")

    def test_weights_only_true_is_mandatory(self):
        torch = MagicMock()
        torch.load.return_value = {"w": MagicMock(shape=(1,))}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            with patch("foundry.convert.os.replace"):
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        self.assertTrue(torch.load.call_args.kwargs.get("weights_only"))

    def test_state_dict_container_unwrapped(self):
        inner = {"w": MagicMock(shape=(1,))}
        torch = MagicMock()
        torch.load.return_value = {"state_dict": inner, "epoch": 3}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            with patch("foundry.convert.os.replace"):
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        saved = st.save_file.call_args.args[0]
        self.assertIn("w", saved)
        self.assertNotIn("epoch", saved)

    def test_save_goes_through_temp_then_replace(self):
        torch = MagicMock()
        torch.load.return_value = {"w": MagicMock(shape=(1,))}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            with patch("foundry.convert.os.replace") as replace:
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        tmp_path = st.save_file.call_args.args[1]
        self.assertTrue(tmp_path.endswith(".converting"))
        replace.assert_called_once_with(tmp_path, "out.safetensors")


if __name__ == "__main__":
    unittest.main()
