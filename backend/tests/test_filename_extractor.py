from app.classification.filename_extractor import extract_from_filename


def test_year_extraction_underscore_delimited():
    # Bekanntes Verhalten: \b matcht nicht zwischen '_' und Ziffer — Jahr wird NICHT erkannt
    meta = extract_from_filename("Bericht_Kegelrad_2019.pdf")
    assert meta.year is None

def test_year_extraction_space_delimited():
    meta = extract_from_filename("Bericht Kegelrad 2019.pdf")
    assert meta.year == 2019

def test_no_year():
    assert extract_from_filename("Kegelradbericht.pdf").year is None

def test_leading_date_prefix_removed():
    meta = extract_from_filename("20170718_Analyse Flankenbruch.pdf")
    assert meta.title == "Analyse Flankenbruch"
    assert meta.doc_type == "report"

def test_fva_heft_title_extraction():
    meta = extract_from_filename("FVA-Heft 1234 - Tragfähigkeit von Kegelrädern.pdf")
    assert meta.doc_type == "report"
    assert meta.title == "Tragfähigkeit von Kegelrädern"

def test_underscores_become_spaces():
    meta = extract_from_filename("Wärmebehandlung_Einsatzstahl.pdf")
    assert meta.title == "Wärmebehandlung Einsatzstahl"

def test_dissertation_detected():
    assert extract_from_filename("Diss_Mustermann_2015.pdf").doc_type == "dissertation"

def test_presentation_detected():
    assert extract_from_filename("Präsentation_Projektstand.pptx").doc_type == "presentation"
