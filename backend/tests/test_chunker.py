from app.services.chunker import chunk_text


def test_chunk_text_returns_ordered_chunks_with_overlap() -> None:
    text = "甲" * 20 + "\n\n" + "乙" * 20

    chunks = chunk_text(text, chunk_size=12, overlap=4)

    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk.content for chunk in chunks)
    assert chunks[0].content[-4:] == chunks[1].content[:4]
    assert all(len(chunk.content_hash) == 64 for chunk in chunks)


def test_chunk_text_ignores_blank_content() -> None:
    assert chunk_text(" \n\n\t ") == []
